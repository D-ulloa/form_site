export type InvitationDeliveryOutcome = 'accepted_by_provider' | 'rejected' | 'ambiguous';
export interface InvitationDeliveryMessage {
    readonly attempt_id: string;
    readonly idempotency_key: string;
    readonly recipient: string;
    readonly organization_display_name: string;
    readonly inviter_display_name: string;
    readonly intended_role: 'admin' | 'member' | 'viewer';
    readonly expires_at: string;
    readonly acceptance_url: string;
    readonly locale: string;
    readonly template_version: string;
}
export interface InvitationDeliveryResult {
    readonly outcome: InvitationDeliveryOutcome;
    readonly provider_reference?: string;
    readonly safe_error_code?: string;
}
export interface InvitationDeliveryAdapter {
    send(message: InvitationDeliveryMessage): Promise<InvitationDeliveryResult>;
}
export declare function renderInvitationEmail(message: InvitationDeliveryMessage): {
    subject: string;
    text: string;
    html: string;
};
export declare class CaptureInvitationDeliveryAdapter implements InvitationDeliveryAdapter {
    readonly messages: InvitationDeliveryMessage[];
    send(message: InvitationDeliveryMessage): Promise<InvitationDeliveryResult>;
}
export declare class DisabledInvitationDeliveryAdapter implements InvitationDeliveryAdapter {
    send(_message: InvitationDeliveryMessage): Promise<InvitationDeliveryResult>;
}
export declare class ResendInvitationDeliveryAdapter implements InvitationDeliveryAdapter {
    private readonly apiKey;
    private readonly from;
    private readonly timeoutMilliseconds;
    private readonly fetcher;
    constructor(apiKey: string, from: string, timeoutMilliseconds: number, fetcher?: typeof fetch);
    send(message: InvitationDeliveryMessage): Promise<InvitationDeliveryResult>;
}
export interface InvitationDeliveryConfiguration {
    readonly enabled: boolean;
    readonly delivery_method: 'share_link' | 'email';
    readonly adapter: 'disabled' | 'capture' | 'resend';
    readonly public_base_url: string;
    readonly template_version: string;
    readonly provider_reference_pepper: string;
    readonly webhook_secret: string;
}
export declare function invitationDeliveryConfiguration(environment: NodeJS.ProcessEnv): InvitationDeliveryConfiguration;
export declare function createInvitationDeliveryAdapter(environment: NodeJS.ProcessEnv): InvitationDeliveryAdapter;
export declare function verifyResendWebhook(payload: Buffer, headers: Readonly<Record<string, string | undefined>>, secret: string, nowSeconds?: number): {
    event_id: string;
    body: unknown;
};
//# sourceMappingURL=invitationDelivery.d.ts.map