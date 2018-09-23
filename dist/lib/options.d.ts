export interface IOptions {
    allowIcannDomains: boolean;
    allowPrivateDomains: boolean;
    extractHostname: (url: string) => string | null;
    strictHostnameValidation: boolean;
    validHosts: string[];
}
export declare function setDefaults({ allowIcannDomains, allowPrivateDomains, extractHostname, strictHostnameValidation, validHosts, }?: Partial<IOptions>): IOptions;
