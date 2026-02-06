export default interface SaveMessage {
  message?: string | Buffer;
  userId?: number;
  chatName: string;
}