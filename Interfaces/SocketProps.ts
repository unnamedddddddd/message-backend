import { Socket } from "socket.io"

export interface SocketProps extends Socket{
  userName?: string;
  currentRoom?: string| null;
}

