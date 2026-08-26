export class OrganizationProvisioningError extends Error {
    code;
    constructor(code) {
        super(code);
        this.code = code;
        this.name = 'OrganizationProvisioningError';
    }
}
//# sourceMappingURL=organizationProvisioningTypes.js.map