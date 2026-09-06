import { EmailProvider, EmailDraftParams, EmailDraftResult, EmailSendParams } from './types';
import { prisma } from '../prisma';

export interface GmailConfig {
  clientId?: string;
  clientSecret?: string;
  refreshToken?: string;
  accessToken?: string;
  userEmail?: string;
}

export class GmailProvider implements EmailProvider {
  name = 'gmail';
  private config: GmailConfig;

  constructor(config: GmailConfig) {
    this.config = config;
  }

  private async getValidAccessToken(): Promise<string> {
    if (this.config.accessToken) {
      return this.config.accessToken;
    }

    if (this.config.clientId && this.config.clientSecret && this.config.refreshToken) {
      const res = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
          refresh_token: this.config.refreshToken,
          grant_type: 'refresh_token',
        }),
      });

      if (res.ok) {
        const data = await res.json();
        this.config.accessToken = data.access_token;
        // Update in DB
        await prisma.emailSettings.updateMany({
          where: { id: 'default' },
          data: { accessToken: data.access_token },
        });
        return data.access_token;
      }
    }

    throw new Error('No valid Gmail access token or refresh token configured.');
  }

  private createMimeMessage(to: string, subject: string, body: string): string {
    const lines = [
      `To: ${to}`,
      `Subject: =?utf-8?B?${Buffer.from(subject).toString('base64')}?=`,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=utf-8',
      'Content-Transfer-Encoding: 7bit',
      '',
      body,
    ];
    const raw = lines.join('\r\n');
    return Buffer.from(raw).toString('base64url');
  }

  async createDraft(params: EmailDraftParams): Promise<EmailDraftResult> {
    try {
      const accessToken = await this.getValidAccessToken();
      const rawMessage = this.createMimeMessage(params.to || '', params.subject, params.body);

      const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/drafts', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: { raw: rawMessage },
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Gmail API error: ${errText}`);
      }

      const data = await res.json();
      return {
        success: true,
        draftId: data.id,
        message: 'Gmail draft created successfully. Open your Gmail Drafts to review and send.',
        provider: this.name,
      };
    } catch (err) {
      // Return helpful fallback simulation for local development without full OAuth
      return {
        success: false,
        message: `Gmail draft creation failed: ${(err as Error).message}. (You can copy the generated email directly from the UI).`,
        provider: this.name,
      };
    }
  }

  async send(params: EmailSendParams): Promise<{ success: boolean; messageId?: string; message: string }> {
    try {
      const accessToken = await this.getValidAccessToken();
      const rawMessage = this.createMimeMessage(params.to, params.subject, params.body);

      const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ raw: rawMessage }),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Gmail Send API error: ${errText}`);
      }

      const data = await res.json();
      return {
        success: true,
        messageId: data.id,
        message: 'Email dispatched successfully via Gmail.',
      };
    } catch (err) {
      return {
        success: false,
        message: `Sending email failed: ${(err as Error).message}`,
      };
    }
  }

  async testConnection(): Promise<{ success: boolean; message: string; email?: string }> {
    try {
      const accessToken = await this.getValidAccessToken();
      const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!res.ok) {
        return { success: false, message: `Gmail authentication error (${res.status})` };
      }

      const data = await res.json();
      return {
        success: true,
        message: `Connected to mailbox: ${data.emailAddress}`,
        email: data.emailAddress,
      };
    } catch (err) {
      return {
        success: false,
        message: (err as Error).message || 'Gmail not connected',
      };
    }
  }
}

export async function getEmailProvider(): Promise<EmailProvider> {
  const settings = await prisma.emailSettings.findFirst({ where: { id: 'default' } });
  return new GmailProvider({
    clientId: settings?.clientId || process.env.GOOGLE_CLIENT_ID,
    clientSecret: settings?.clientSecret || process.env.GOOGLE_CLIENT_SECRET,
    refreshToken: settings?.refreshToken,
    accessToken: settings?.accessToken,
    userEmail: settings?.userEmail,
  });
}
