import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import propertiesRouter from './routes/properties.js';
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
import { DisabledInvitationDeliveryAdapter, OrganizationService } from './organizations/organizationService.js';
import { OrganizationSettingsService } from './organizations/organizationSettingsService.js';
import { createOrganizationGovernanceRouter } from './routes/organizationGovernance.js';
import {
  createIdentityRouter, createOrganizationContextRouter, createTenantMutationSecurity,
} from './routes/identity.js';
import {
  parseTrustProxyHops,
  validateContainmentEnvironment,
} from './utils/serverConfig.js';
import { requestIdMiddleware } from './platform/requestId.js';

dotenv.config();
validateContainmentEnvironment(process.env);
validateIdentityEnvironment(process.env);

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
const governanceServices = {
  organizations: new OrganizationService(governanceRepository, new DisabledInvitationDeliveryAdapter()),
  memberships: new MembershipService(createMembershipMutationRepository(process.env)),
  settings: new OrganizationSettingsService(createOrganizationSettingsRepository(process.env)),
};

app.use('/api/auth', createIdentityRouter(
  sessionService, createSupabaseIdentityProvider(process.env), process.env,
));
app.use('/api', createOrganizationContextRouter(sessionService, identityRepository, process.env));
app.use('/api', createTenantMutationSecurity(sessionService, process.env),
  createOrganizationGovernanceRouter(contextResolver, governanceServices,
    process.env.CONTRACT_PUBLIC_BASE_URL?.trim() ?? 'https://invalid.example'));

app.use('/properties', propertiesRouter);
app.use('/api/contracts', contractEntriesRouter);
app.use('/api/contracts', contractsRouter);
app.use('/api/legacy-auth', contractPasswordAuthRouter);

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`[server] Running on http://localhost:${PORT}`);
});
