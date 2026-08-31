import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import propertiesRouter, { createTenantPropertyCompatibilityRouter } from './routes/properties.js';
import contractsRouter from './routes/contracts.js';
import contractEntriesRouter from './routes/contractEntries.js';
import contractPasswordAuthRouter from './routes/contractPasswordAuth.js';
import { createIdentityRepository } from './identity/identityRepository.js';
import { createOrganizationRouteContextResolver } from './identity/organizationContextResolver.js';
import { SessionService } from './identity/sessionService.js';
import { approvedOrigins, validateIdentityEnvironment } from './identity/sessionSecurity.js';
import { createSupabaseIdentityProvider } from './identity/supabaseIdentityProvider.js';
import { MembershipService } from './organizations/membershipService.js';
import {
  createMembershipMutationRepository, createOrganizationGovernanceRepository,
  createOrganizationSettingsRepository,
} from './organizations/organizationRepository.js';
import { OrganizationService } from './organizations/organizationService.js';
import { createInvitationDeliveryAdapter, invitationDeliveryConfiguration } from './organizations/invitationDelivery.js';
import { createInvitationWorkflowRepository, InvitationWorkflowService } from './organizations/invitationWorkflow.js';
import { createIdentityProvisioningRepository } from './identity/identityProvisioningRepository.js';
import { IdentityProvisioningService } from './identity/identityProvisioningService.js';
import { createSupabaseAdminAdapter } from './identity/supabaseAdminAdapter.js';
import { OrganizationSettingsService } from './organizations/organizationSettingsService.js';
import { createInvitationWebhookRouter, createOrganizationGovernanceRouter } from './routes/organizationGovernance.js';
import {
  createIdentityRouter, createOrganizationContextRouter, createTenantMutationSecurity,
} from './routes/identity.js';
import {
  parseTrustProxyHops,
  validateContainmentEnvironment,
} from './utils/serverConfig.js';
import { requestIdMiddleware } from './platform/requestId.js';
import { createTenantContractEntriesRouter } from './routes/tenantContractEntries.js';
import { validateIdentityProvisioningEnvironment } from './identity/identityProvisioningConfig.js';
import { createDistributedRateLimiter } from './platform/rateLimit.js';
import { createPlatformRepository } from './platform/platformRepository.js';

dotenv.config();
validateContainmentEnvironment(process.env);
validateIdentityEnvironment(process.env);
validateIdentityProvisioningEnvironment(process.env);
const invitationConfig = invitationDeliveryConfiguration(process.env);

const app = express();
const PORT = process.env.PORT ?? 3001;
const trustProxyHops = parseTrustProxyHops(process.env.TRUST_PROXY_HOPS);
const allowedOrigins = approvedOrigins(process.env);
const corsOrigin = process.env.NODE_ENV === 'production'
  ? (origin: string | undefined, callback: (error: Error | null, allow?: boolean) => void) => {
      if (!origin || !allowedOrigins.has(origin)) callback(new Error('CORS origin denied.'));
      else callback(null, true);
    }
  : true;

if (trustProxyHops > 0) {
  app.set('trust proxy', trustProxyHops);
}

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(requestIdMiddleware);
app.use(cors({ origin: corsOrigin, credentials: true }));
const invitationWorkflow = new InvitationWorkflowService(createInvitationWorkflowRepository(process.env),
  createInvitationDeliveryAdapter(process.env), invitationConfig);
const invitationRateLimiter = invitationConfig.enabled
  ? createDistributedRateLimiter(createPlatformRepository(undefined, process.env), process.env.PLATFORM_RATE_LIMIT_PEPPER ?? '')
  : undefined;
app.use('/api/provider-webhooks/invitation-email', express.raw({ type: 'application/json', limit: '64kb' }),
  createInvitationWebhookRouter(invitationWorkflow, process.env, invitationRateLimiter));
app.use(express.json({ limit: '256kb' }));

// Strip Vercel's experimentalServices route prefix if present
app.use((req, _res, next) => {
  if (req.url.startsWith('/_/backend')) {
    req.url = req.url.replace('/_/backend', '');
  }
  next();
});

// ─── Routes ───────────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok' });
});

const identityRepository = createIdentityRepository(process.env);
const sessionService = new SessionService(identityRepository, process.env);
const contextResolver = createOrganizationRouteContextResolver(sessionService);
const governanceRepository = createOrganizationGovernanceRepository(process.env);
const invitationAdmin = createSupabaseAdminAdapter(process.env);
const invitationIdentity = new IdentityProvisioningService(createIdentityProvisioningRepository(process.env),
  invitationAdmin, process.env);
const governanceServices = {
  organizations: new OrganizationService(governanceRepository, undefined, invitationWorkflow, invitationIdentity),
  memberships: new MembershipService(createMembershipMutationRepository(process.env)),
  settings: new OrganizationSettingsService(createOrganizationSettingsRepository(process.env)),
  invitations: invitationWorkflow,
  sessions: sessionService,
  identityProvider: createSupabaseIdentityProvider(process.env),
  environment: process.env,
};

app.use('/api/auth', createIdentityRouter(
  sessionService, createSupabaseIdentityProvider(process.env), process.env,
));
app.use('/api', createOrganizationContextRouter(sessionService, identityRepository, process.env));
app.use('/api/organizations/:organization/contracts',
  createTenantContractEntriesRouter(sessionService, undefined, process.env));
app.use('/api/organizations/:organization/properties/legacy',
  createTenantPropertyCompatibilityRouter(sessionService, process.env));
app.use('/api', createTenantMutationSecurity(sessionService, process.env),
  createOrganizationGovernanceRouter(contextResolver, governanceServices,
    invitationConfig.public_base_url || 'https://invalid.example', invitationRateLimiter));

app.use('/properties', propertiesRouter);
app.use('/api/contracts', contractEntriesRouter);
app.use('/api/contracts', contractsRouter);
app.use('/api/legacy-auth', contractPasswordAuthRouter);

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`[server] Running on http://localhost:${PORT}`);
});
