// Demo data for reviewers: npm run seed. Reads SEED_* from env, goes through the real services
// (never raw inserts) so every ticket has a correct history trail, is idempotent (users and
// categories upsert by natural key; ticket data is only created into an empty tickets collection),
// and prints counts only — never emails, never passwords.
import { connectDb, disconnectDb } from '../src/db.js';
import type { Caller } from '../src/middleware/auth.js';
import { categoriesRepository } from '../src/modules/categories/categories.repository.js';
import { categoriesService } from '../src/modules/categories/categories.service.js';
import { commentsService } from '../src/modules/comments/comments.service.js';
import { passwordService } from '../src/modules/auth/password.service.js';
import type { Status } from '../src/modules/tickets/ticket-status.policy.js';
import { TicketModel, type Priority } from '../src/modules/tickets/ticket.model.js';
import { ticketsService } from '../src/modules/tickets/tickets.service.js';
import type { Role, UserDocument } from '../src/modules/users/user.model.js';
import { userRepository } from '../src/modules/users/user.repository.js';

function out(line: string): void {
  process.stdout.write(`${line}\n`);
}

function fail(message: string): never {
  process.stderr.write(`seed: ${message}\n`);
  process.exit(1);
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) fail(`missing ${name} — set it in .env (see .env.example)`);
  return value;
}

async function ensureUser(
  email: string,
  password: string,
  name: string,
  role: Role,
): Promise<{ user: UserDocument; created: boolean }> {
  const existing = await userRepository.findByEmailWithHash(email);
  if (existing) return { user: existing, created: false };
  // Same policy as registration; a weak seed password fails loudly instead of shipping quietly.
  passwordService.assertPolicy(password, email);
  const user = await userRepository.create({
    email,
    name,
    passwordHash: await passwordService.hash(password),
    role,
  });
  return { user, created: true };
}

const CATEGORY_NAMES = [
  'Billing',
  'Technical issue',
  'Account access',
  'Feature request',
  'General',
];

interface TicketFixture {
  title: string;
  description: string;
  priority: Priority;
  category: number; // index into CATEGORY_NAMES
  requester: 0 | 1; // demo user index
  status: Status;
  assign?: boolean;
  comments?: { text: string; byAdmin?: boolean; internal?: boolean }[];
}

const FIXTURES: TicketFixture[] = [
  {
    title: 'Invoice PDF export fails with a blank page',
    description: 'Exporting any invoice from March renders an empty PDF.',
    priority: 'high',
    category: 0,
    requester: 0,
    status: 'in_progress',
    assign: true,
    comments: [
      { text: 'Happens on every browser I tried.' },
      { text: 'Reproduced on staging, looking into the renderer.', byAdmin: true },
      {
        text: 'Customer is on the legacy plan — check the old template path.',
        byAdmin: true,
        internal: true,
      },
    ],
  },
  {
    title: 'Charged twice for the annual plan',
    description: 'My card shows two identical charges on the 3rd.',
    priority: 'urgent',
    category: 0,
    requester: 1,
    status: 'in_progress',
    assign: true,
    comments: [{ text: 'Refund initiated, should settle in 3–5 days.', byAdmin: true }],
  },
  {
    title: 'VAT number not shown on receipts',
    description: 'Receipts are missing our company VAT number.',
    priority: 'medium',
    category: 0,
    requester: 0,
    status: 'open',
  },
  {
    title: 'Proration looks wrong after seat upgrade',
    description: 'We added 4 seats mid-cycle and the proration seems off by one day.',
    priority: 'low',
    category: 0,
    requester: 1,
    status: 'resolved',
  },
  {
    title: 'Cannot update the saved credit card',
    description: 'Saving a new card spins forever.',
    priority: 'high',
    category: 0,
    requester: 1,
    status: 'closed',
  },
  {
    title: 'App crashes when opening the dashboard',
    description: 'Since this morning the dashboard tab crashes immediately.',
    priority: 'urgent',
    category: 1,
    requester: 0,
    status: 'in_progress',
    assign: true,
    comments: [{ text: 'Stack trace attached in the logs.', byAdmin: true, internal: true }],
  },
  {
    title: 'Search returns no results for exact matches',
    description: 'Searching an exact ticket title returns nothing.',
    priority: 'high',
    category: 1,
    requester: 1,
    status: 'open',
    comments: [{ text: 'Also broken with quotes around the query.' }],
  },
  {
    title: 'Webhook deliveries delayed by ~10 minutes',
    description: 'Our integration receives events far too late.',
    priority: 'high',
    category: 1,
    requester: 0,
    status: 'resolved',
  },
  {
    title: 'CSV import drops the last row',
    description: 'Every import silently loses the final row of the file.',
    priority: 'medium',
    category: 1,
    requester: 1,
    status: 'in_progress',
  },
  {
    title: 'Dark mode flickers on page load',
    description: 'A white flash shows before the theme applies.',
    priority: 'low',
    category: 1,
    requester: 0,
    status: 'open',
  },
  {
    title: 'Error 500 when saving a draft twice',
    description: 'Second save of the same draft always fails.',
    priority: 'medium',
    category: 1,
    requester: 1,
    status: 'closed',
  },
  {
    title: 'Two-factor codes rejected',
    description: 'TOTP codes from my authenticator are always "invalid".',
    priority: 'urgent',
    category: 2,
    requester: 0,
    status: 'resolved',
    assign: true,
    comments: [
      { text: 'Your device clock was 90 seconds behind — fixed after resync.', byAdmin: true },
    ],
  },
  {
    title: 'Locked out after password manager update',
    description: 'The stored password no longer works and reset emails never arrive.',
    priority: 'high',
    category: 2,
    requester: 1,
    status: 'in_progress',
    assign: true,
  },
  {
    title: 'Session expires too quickly on mobile',
    description: 'I get signed out every few minutes on the app.',
    priority: 'medium',
    category: 2,
    requester: 0,
    status: 'open',
  },
  {
    title: 'Cannot change the account email address',
    description: 'The save button stays disabled on the profile page.',
    priority: 'low',
    category: 2,
    requester: 1,
    status: 'open',
  },
  {
    title: 'Old invitation links still work',
    description: 'A teammate used an invite from last year — should those expire?',
    priority: 'high',
    category: 2,
    requester: 0,
    status: 'closed',
  },
  {
    title: 'Add bulk status change to the ticket list',
    description: 'Changing status one by one is slow for busy days.',
    priority: 'low',
    category: 3,
    requester: 1,
    status: 'open',
    comments: [{ text: 'Even 10 at a time would help.' }],
  },
  {
    title: 'Export tickets to CSV',
    description: 'We need a monthly export for reporting.',
    priority: 'medium',
    category: 3,
    requester: 0,
    status: 'open',
  },
  {
    title: 'Keyboard shortcuts for the composer',
    description: 'Cmd+Enter to send would be great.',
    priority: 'low',
    category: 3,
    requester: 1,
    status: 'closed',
  },
  {
    title: 'Weekly summary email',
    description: 'A digest of open tickets per category.',
    priority: 'low',
    category: 3,
    requester: 0,
    status: 'open',
  },
  {
    title: 'Attachment previews for images',
    description: 'Show a thumbnail instead of a bare filename.',
    priority: 'medium',
    category: 3,
    requester: 1,
    status: 'resolved',
  },
  {
    title: 'Where can I find the API documentation?',
    description: 'Looking for the public API reference.',
    priority: 'low',
    category: 4,
    requester: 0,
    status: 'closed',
    comments: [{ text: 'Linked in the README — closing.', byAdmin: true }],
  },
  {
    title: 'Office IP allowlisting question',
    description: 'Do you support restricting sign-in to our office network?',
    priority: 'medium',
    category: 4,
    requester: 1,
    status: 'open',
  },
  {
    title: 'Data retention policy for closed tickets',
    description: 'How long are closed tickets and attachments kept?',
    priority: 'medium',
    category: 4,
    requester: 0,
    status: 'in_progress',
    assign: true,
  },
  {
    title: 'Invoice address shows the old company name',
    description: 'We rebranded last month; invoices still show the old name.',
    priority: 'medium',
    category: 0,
    requester: 1,
    status: 'open',
  },
];

async function main(): Promise<void> {
  const adminEmail = requireEnv('SEED_ADMIN_EMAIL');
  const adminPassword = requireEnv('SEED_ADMIN_PASSWORD');
  const userEmail = requireEnv('SEED_USER_EMAIL');
  const userPassword = requireEnv('SEED_USER_PASSWORD');
  const [userLocal, userDomain] = userEmail.split('@');
  if (!userLocal || !userDomain) fail('SEED_USER_EMAIL is not a valid email address');
  const secondUserEmail = `${userLocal}+2@${userDomain}`;

  await connectDb();

  const [adminResult, firstUser, secondUser] = [
    await ensureUser(adminEmail, adminPassword, 'Omar Admin', 'admin'),
    await ensureUser(userEmail, userPassword, 'Dana Levi', 'user'),
    await ensureUser(secondUserEmail, userPassword, 'Sami Haddad', 'user'),
  ];
  const usersCreated = [adminResult, firstUser, secondUser].filter((r) => r.created).length;

  const existingCategories = await categoriesRepository.listAll(true);
  const existingNames = new Set(existingCategories.map((c) => c.name));
  let categoriesCreated = 0;
  for (const name of CATEGORY_NAMES) {
    if (!existingNames.has(name)) {
      await categoriesService.create({ name });
      categoriesCreated += 1;
    }
  }
  const categories = await categoriesRepository.listActive();
  const categoryIdFor = (index: number): string => {
    const name = CATEGORY_NAMES[index % CATEGORY_NAMES.length];
    const match = categories.find((c) => c.name === name);
    if (!match) fail(`category "${name ?? ''}" missing after seeding`);
    return match._id.toString();
  };

  // Ticket data only goes into an empty collection so re-runs never duplicate it.
  const existingTickets = await TicketModel.estimatedDocumentCount().exec();
  let ticketsCreated = 0;
  let commentsCreated = 0;
  if (existingTickets > 0) {
    out(
      `seed: tickets collection already has ${existingTickets} documents — ticket seeding skipped`,
    );
  } else {
    const adminCaller: Caller = {
      id: adminResult.user._id.toString(),
      role: 'admin',
      requestId: 'seed',
    };
    const requesters = [firstUser.user, secondUser.user];

    for (const fixture of FIXTURES) {
      const requesterDoc = requesters[fixture.requester];
      if (!requesterDoc) fail('fixture requester out of range');
      const requesterCaller: Caller = {
        id: requesterDoc._id.toString(),
        role: 'user',
        requestId: 'seed',
      };
      const ticket = await ticketsService.create(
        {
          title: fixture.title,
          description: fixture.description,
          categoryId: categoryIdFor(fixture.category),
          priority: fixture.priority,
        },
        requesterCaller,
      );
      const ticketId = ticket._id.toString();
      ticketsCreated += 1;

      if (fixture.assign) {
        await ticketsService.adminPatch(ticketId, { assigneeId: adminCaller.id }, adminCaller);
      }

      // Comments first — a closed ticket rejects them (409 TICKET_CLOSED by design).
      for (const comment of fixture.comments ?? []) {
        if (comment.byAdmin) {
          await commentsService.createForAdmin(
            ticketId,
            adminCaller,
            comment.text,
            comment.internal ?? false,
          );
        } else {
          await commentsService.createForOwner(ticketId, requesterCaller, comment.text);
        }
        commentsCreated += 1;
      }

      // Walk the status machine through the services so every step leaves a real event.
      if (fixture.status === 'in_progress' || fixture.status === 'resolved') {
        await ticketsService.changeStatus(ticketId, 'in_progress', 'admin', adminCaller);
      }
      if (fixture.status === 'resolved') {
        await ticketsService.changeStatus(ticketId, 'resolved', 'admin', adminCaller);
      }
      if (fixture.status === 'closed') {
        await ticketsService.changeStatus(ticketId, 'closed', 'requester', requesterCaller);
      }
    }
  }

  out(
    `seed: users created=${usersCreated} (total demo users: 3) · categories created=${categoriesCreated} · tickets created=${ticketsCreated} · comments created=${commentsCreated}`,
  );
  await disconnectDb();
}

main().catch((err: unknown) => {
  fail(err instanceof Error ? err.message : String(err));
});
