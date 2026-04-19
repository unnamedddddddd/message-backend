export interface EncryptedMessage {
  iv: string;
  content: string;
  tag: string;
}

export default EncryptedMessage;