export default interface SaveMessage {
  message?: string | Buffer;
  userId?: number;
  chatId: string;
}