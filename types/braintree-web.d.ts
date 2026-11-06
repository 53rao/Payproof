declare module "braintree-web/client" {
  export interface ClientInstance {}
  export function create(options: { authorization: string }): Promise<ClientInstance>;
}

declare module "braintree-web/hosted-fields" {
  import type { ClientInstance } from "braintree-web/client";

  export interface HostedFieldsInstance {
    tokenize(): Promise<{ nonce: string }>;
    teardown(): Promise<void>;
  }

  export function create(options: {
    client: ClientInstance;
    styles: Record<string, Record<string, string>>;
    fields: {
      number: { container: string; placeholder?: string };
      expirationDate: { container: string; placeholder?: string };
      cvv: { container: string; placeholder?: string };
      postalCode?: { container: string; placeholder?: string };
    };
  }): Promise<HostedFieldsInstance>;
}
