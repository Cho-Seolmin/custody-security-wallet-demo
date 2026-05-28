import { Injectable } from "@nestjs/common";
import {
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import { Server } from "socket.io";

type WithdrawUpdatedPayload = {
  withdrawRequestId: string;
  walletId: string;
  walletType?: string;
  status: string;
  txHash?: string | null;
  message?: string;
};

@Injectable()
@WebSocketGateway({
  cors: {
    origin: "http://localhost:5173",
    credentials: true,
  },
})
export class WithdrawGateway {
  @WebSocketServer()
  server: Server;

  emitWithdrawUpdated(payload: WithdrawUpdatedPayload) {
    this.server.emit("withdraw.updated", payload);
  }
}