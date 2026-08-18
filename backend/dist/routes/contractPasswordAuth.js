import { Router } from 'express';
import { clearContractPasswordSessionCookie, ContractPasswordAuthConfigurationError, ContractPasswordAuthError, loginContractGoogleUser, getContractPasswordSession, loginContractUser, registerContractUser, serializeContractPasswordSessionCookie, } from '../services/contractPasswordAuth.js';
function setPrivateHeaders(res) {
    res.set('Cache-Control', 'no-store');
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Referrer-Policy', 'no-referrer');
}
function stringValue(value) {
    return typeof value === 'string' ? value.trim() : '';
}
function authBody(body) {
    const value = typeof body === 'object' && body !== null
        ? body
        : {};
    return {
        email: stringValue(value.email),
        password: typeof value.password === 'string' ? value.password : '',
        ...(stringValue(value.name) ? { name: stringValue(value.name) } : {}),
        ...(stringValue(value.company) ? { company: stringValue(value.company) } : {}),
        ...(stringValue(value.role) ? { role: stringValue(value.role) } : {}),
        rememberMe: value.rememberMe === true,
    };
}
function googleAuthBody(body) {
    const value = typeof body === 'object' && body !== null
        ? body
        : {};
    return {
        accessToken: typeof value.accessToken === 'string' ? value.accessToken.trim() : '',
        rememberMe: value.rememberMe === true,
    };
}
function validateCredentials(credentials, registration) {
    if (!credentials.email
        || credentials.email.length > 320
        || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(credentials.email)) {
        return 'Ingresá un correo electrónico válido.';
    }
    if (credentials.password.length < 8) {
        return 'La contraseña debe tener al menos 8 caracteres.';
    }
    if (credentials.password.length > 1024) {
        return 'La contraseña es demasiado larga.';
    }
    if (registration && !credentials.name)
        return 'Ingresá tu nombre completo.';
    if ((credentials.name?.length ?? 0) > 256)
        return 'El nombre es demasiado largo.';
    if ((credentials.company?.length ?? 0) > 256)
        return 'El nombre de la empresa es demasiado largo.';
    if ((credentials.role?.length ?? 0) > 256)
        return 'El cargo o rol es demasiado largo.';
    return null;
}
function validateGoogleAccessToken(credentials) {
    if (!credentials.accessToken
        || credentials.accessToken.length > 16384
        || /[\u0000-\u001F\u007F]/u.test(credentials.accessToken)) {
        return 'No se pudo validar la cuenta de Google.';
    }
    return null;
}
function publicUser(session) {
    return { id: session.userId, email: session.email, name: session.name };
}
function sendAuthError(res, error) {
    if (error instanceof ContractPasswordAuthError) {
        const status = error.code === 'registration_closed'
            ? 403
            : error.code === 'email_in_use'
                ? 409
                : error.code === 'not_admin'
                    ? 403
                    : 401;
        res.status(status).json({
            error: error.code === 'registration_closed'
                ? 'REGISTRATION_CLOSED'
                : error.code === 'email_in_use'
                    ? 'EMAIL_IN_USE'
                    : error.code === 'not_admin'
                        ? 'NOT_ADMIN'
                        : 'INVALID_CREDENTIALS',
            message: error.message,
            retriable: false,
        });
        return;
    }
    if (error instanceof ContractPasswordAuthConfigurationError) {
        res.status(503).json({
            error: 'AUTH_CONFIGURATION_ERROR',
            message: 'El inicio de sesión no está disponible temporalmente.',
            retriable: false,
        });
        return;
    }
    console.error('[contract-auth] unexpected password auth error', error instanceof Error ? error.name : 'UnknownError');
    res.status(500).json({
        error: 'AUTHENTICATION_ERROR',
        message: 'No se pudo completar la autenticación.',
        retriable: false,
    });
}
function resolveDependencies(overrides) {
    return {
        environment: overrides.environment ?? process.env,
        register: overrides.register ?? registerContractUser,
        login: overrides.login ?? loginContractUser,
        googleLogin: overrides.googleLogin ?? loginContractGoogleUser,
        getSession: overrides.getSession ?? getContractPasswordSession,
        serializeSessionCookie: overrides.serializeSessionCookie ?? serializeContractPasswordSessionCookie,
        clearSessionCookie: overrides.clearSessionCookie ?? clearContractPasswordSessionCookie,
    };
}
export function createContractPasswordAuthRouter(dependencyOverrides = {}) {
    const dependencies = resolveDependencies(dependencyOverrides);
    const router = Router();
    router.post('/register', async (req, res) => {
        setPrivateHeaders(res);
        if (dependencies.environment.NODE_ENV !== 'development'
            || dependencies.environment.CONTRACT_ALLOW_SYNTHETIC_REGISTRATION !== 'true') {
            res.status(403).json({
                error: 'REGISTRATION_CLOSED',
                message: 'El registro está cerrado. Solicitá una invitación al administrador.',
                retriable: false,
            });
            return;
        }
        const credentials = authBody(req.body);
        const validationError = validateCredentials(credentials, true);
        if (validationError) {
            res.status(400).json({
                error: 'INVALID_REQUEST',
                message: validationError,
                retriable: false,
            });
            return;
        }
        try {
            const session = await dependencies.register(credentials, dependencies.environment);
            res.set('Set-Cookie', dependencies.serializeSessionCookie(session, dependencies.environment, credentials.rememberMe));
            res.status(201).json({ authenticated: true, user: publicUser(session) });
        }
        catch (error) {
            sendAuthError(res, error);
        }
    });
    router.post('/login', async (req, res) => {
        setPrivateHeaders(res);
        const credentials = authBody(req.body);
        const validationError = validateCredentials(credentials, false);
        if (validationError) {
            res.status(400).json({
                error: 'INVALID_REQUEST',
                message: validationError,
                retriable: false,
            });
            return;
        }
        try {
            const session = await dependencies.login(credentials, dependencies.environment);
            res.set('Set-Cookie', dependencies.serializeSessionCookie(session, dependencies.environment, credentials.rememberMe));
            res.status(200).json({ authenticated: true, user: publicUser(session) });
        }
        catch (error) {
            sendAuthError(res, error);
        }
    });
    router.post('/google/session', async (req, res) => {
        setPrivateHeaders(res);
        const credentials = googleAuthBody(req.body);
        const validationError = validateGoogleAccessToken(credentials);
        if (validationError) {
            res.status(400).json({
                error: 'INVALID_REQUEST',
                message: validationError,
                retriable: false,
            });
            return;
        }
        try {
            const session = await dependencies.googleLogin(credentials, dependencies.environment);
            res.set('Set-Cookie', dependencies.serializeSessionCookie(session, dependencies.environment, credentials.rememberMe));
            res.status(200).json({ authenticated: true, user: publicUser(session) });
        }
        catch (error) {
            sendAuthError(res, error);
        }
    });
    router.get('/session', (req, res) => {
        setPrivateHeaders(res);
        try {
            const session = dependencies.getSession(req, dependencies.environment);
            if (!session) {
                res.status(200).json({ authenticated: false });
                return;
            }
            res.status(200).json({
                authenticated: true,
                user: publicUser(session),
            });
        }
        catch (error) {
            sendAuthError(res, error);
        }
    });
    router.post('/logout', (_req, res) => {
        setPrivateHeaders(res);
        res.set('Set-Cookie', dependencies.clearSessionCookie(dependencies.environment));
        res.status(204).end();
    });
    return router;
}
export default createContractPasswordAuthRouter();
//# sourceMappingURL=contractPasswordAuth.js.map