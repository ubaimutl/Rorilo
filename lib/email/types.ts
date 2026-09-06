export interface EmailAttachment {
  filename: string;
  content: string; // base64 encoded
  contentType: string;
}

export interface EmailDraftParams {
  to?: string;
  subject: string;
  body: string;
  attachments?: EmailAttachment[];
}

export interface EmailSendParams extends EmailDraftParams {
  to: string;
}

export interface EmailDraftResult {
  success: boolean;
  draftId?: string;
  message: string;
  provider: string;
}

export interface EmailProvider {
  name: string;
  createDraft(params: EmailDraftParams): Promise<EmailDraftResult>;
  send(params: EmailSendParams): Promise<{ success: boolean; messageId?: string; message: string }>;
  testConnection(): Promise<{ success: boolean; message: string; email?: string }>;
}
