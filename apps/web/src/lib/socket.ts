import { io } from "socket.io-client";
import { API_BASE_URL } from "../api/axios";

export const socket = io(API_BASE_URL, {
  withCredentials: true,
  transports: ["websocket"],
});
