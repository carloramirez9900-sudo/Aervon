export interface AuthRequestMetadata {
  ip?: string | null;
  userAgent?: string | null;
}

export interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from?: {
      id: number;
      username?: string;
    };
    chat: { id: number; type: string };
    text?: string;
    contact?: {
      phone_number: string;
      user_id?: number;
    };
  };
}
