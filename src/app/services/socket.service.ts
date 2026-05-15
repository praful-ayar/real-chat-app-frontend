import { Injectable } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { environment } from '../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class SocketService {

  socket: Socket;

  constructor() {

    this.socket = io(`${environment.socket}`);

    this.socket.on('connect', () => {
      console.log("Socket Connected");
    });
  }

  join(username: string) {
    this.socket.emit('join', username);
  }

  sendMessage(data: any) {
    this.socket.emit('message', data);
  }

  onMessage(cb: any) {
    this.socket.on('message', cb);
  }

  onUsers(cb: any) {
    this.socket.on('users', cb);
  }

  onOldMessages(callback: (messages: any[]) => void) {
    this.socket.on('oldMessages', callback);
  }

}