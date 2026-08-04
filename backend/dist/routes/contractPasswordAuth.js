import { Router } from 'express';
import { clearContractPasswordSessionCookie, ContractPasswordAuthConfigurationError, ContractPasswordAuthError, getContractPasswordSession, loginContractUser, registerContractUser, serializeContractPasswordSessionCookie, } from '../services/contractPasswordAuth.js';
function setPrivateHeaders(res) {
    res.set('Cache-Control', 'no-store');
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Referrer-Policy', 'no-referrer');
}
function stringValue(value) {
    return typeof value === 'string' ? value.trim() : '';
}
function authBody(body) {
    const value = typeof body === 'object' && body !== null ? body : {};
    return {
        email: stringValue(value.email),
        password: typeof value.password === 'string' ? value.password : '',
        name: stringValue(value.name),
        company: stringValue(value.company),
        role: stringValue(value.role),
        rememberMe: value.rememberMe === true,
    };
}
function validateCredentials(credentials, registration) {
    if (!credentials.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(credentials.email)) {
        return 'Ingresá un correo electrónico válido.';
    }
    if (credentials.password.length < 8)
        return 'La contraseña debe tener al menos 8 caracteres.';
    if (registration && !credentials.name)
        return 'Ingresá tu nombre completo.';
    return null;
}
function publicUser(session) {
    return { id: session.userId, email: session.email, name: session.name };
}
function sendAuthError(res, error) {
    if (error instanceof ContractPasswordAuthError) {
        const status = error.code === 'email_in_use' ? 409 : error.code === 'not_admin' ? 403 : 401;
        res.status(status).json({
            error: error.code === 'email_in_use' ? 'EMAIL_IN_USE' : error.code === 'not_admin' ? 'NOT_ADMIN' : 'INVALID_CREDENTIALS',
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
export function createContractPasswordAuthRouter(environment = process.env) {
    const router = Router();
    router.post('/register', async (req, res) => {
        setPrivateHeaders(res);
        const credentials = authBody(req.body);
        const validationError = validateCredentials(credentials, true);
        if (validationError) {
            res.status(400).json({ error: 'INVALID_REQUEST', message: validationError, retriable: false });
            return;
        }
        try {
            const session = await registerContractUser(credentials, environment);
            res.set('Set-Cookie', serializeContractPasswordSessionCookie(session, environment, credentials.rememberMe));
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
            res.status(400).json({ error: 'INVALID_REQUEST', message: validationError, retriable: false });
            return;
        }
        try {
            const session = await loginContractUser(credentials, environment);
            res.set('Set-Cookie', serializeContractPasswordSessionCookie(session, environment, credentials.rememberMe));
            res.status(200).json({ authenticated: true, user: publicUser(session) });
        }
        catch (error) {
            sendAuthError(res, error);
        }
    });
    router.get('/session', (req, res) => {
        setPrivateHeaders(res);
        const session = getContractPasswordSession(req, environment);
        if (!session) {
            res.status(200).json({ authenticated: false });
            return;
        }
        res.status(200).json({
            authenticated: true,
            user: {
                id: session.userId,
                email: session.email,
                name: session.name,
            },
        });
    });
    router.post('/logout', (_req, res) => {
        setPrivateHeaders(res);
        res.set('Set-Cookie', clearContractPasswordSessionCookie(environment));
        res.status(204).end();
    });
    return router;
}
export default createContractPasswordAuthRouter();
//# sourceMappingURL=contractPasswordAuth.js.map