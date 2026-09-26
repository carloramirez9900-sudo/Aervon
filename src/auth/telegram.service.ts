import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class TelegramService {
  constructor(private readonly config: ConfigService) {}

  getDeepLink(token: string): string {
    const username = this.config.get<string>('TELEGRAM_BOT_USERNAME');
    if (!username) throw new Error('TELEGRAM_BOT_USERNAME is required');
    return `https://t.me/${username.replace(/^@/, '')}?start=${encodeURIComponent(token)}`;
  }

  async requestContact(chatId: number): Promise<void> {
    await this.sendMessage(chatId, 'Para verificar tu cuenta, comparte el número de teléfono asociado a este registro.', {
      keyboard: [[{ text: '📱 Compartir número', request_contact: true }]],
      resize_keyboard: true,
      one_time_keyboard: true,
    });
  }

  async sendVerified(chatId: number): Promise<void> {
    await this.sendMessage(chatId, '✅ Número verificado. Regresa a la plataforma para terminar tu registro.', {
      remove_keyboard: true,
    });
  }

  private async sendMessage(chatId: number, text: string, replyMarkup?: Record<string, unknown>): Promise<void> {
    const token = this.config.get<string>('TELEGRAM_BOT_TOKEN');
    if (!token) throw new Error('TELEGRAM_BOT_TOKEN is required');
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, ...(replyMarkup ? { reply_markup: replyMarkup } : {}) }),
    });
    if (!response.ok) throw new Error(`Telegram sendMessage failed with HTTP ${response.status}`);
  }
}
