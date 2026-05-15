import { Component, NgZone, OnInit, OnDestroy, ChangeDetectorRef, ViewChild, ElementRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';

import { MatToolbarModule } from '@angular/material/toolbar';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatListModule } from '@angular/material/list';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';

import { SocketService } from '../../services/socket.service';
import { AuthService } from '../../services/auth.service';
import { environment } from '../../environments/environment';

export interface ChatMessage {
  _id?: string;        // Added for message deletion support
  user?: string;       // Compatibility with socket
  username?: string;   // New API payload support
  message?: string;    // Compatibility with socket
  text?: string;       // New API payload support
  receiver?: string;   // Private message receiver
  timestamp?: Date | string | number;
}

@Component({
  selector: 'app-chat',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatToolbarModule,
    MatInputModule,
    MatButtonModule,
    MatListModule,
    MatIconModule,
    MatCardModule
  ],
  templateUrl: './chat.html',
  styleUrls: ['./chat.css']
})
export class Chat implements OnInit, OnDestroy {

  @ViewChild('scrollMe') private myScrollContainer!: ElementRef;
  message = '';
  messages: ChatMessage[] = [];
  users: any[] = [];
  currentUser: string | null = null;
  selectedUser: string | null = null; // null = public chat, string = private chat
  unreadCounts: { [key: string]: number } = {};

  constructor(
    private socket: SocketService,
    private zone: NgZone,
    private cdr: ChangeDetectorRef,
    private router: Router,
    private authService: AuthService
  ) { }

  async ngOnInit() {
    this.currentUser = localStorage.getItem('user');

    if (this.currentUser) {
      this.socket.join(this.currentUser);
    } else {
      console.warn('No user found in localStorage. Please log in.');
      this.router.navigate(['/']);
      return;
    }

    // Load initial public messages
    this.loadMessages();

    this.socket.onUsers((u: any[]) => {
      this.zone.run(() => {
        // Filter out current user so only other users appear in the list
        this.users = u.filter(user => user.username !== this.currentUser);
        this.cdr.detectChanges(); // Turant UI update karega
      });
    });

    this.socket.onMessage((msg: ChatMessage) => {
      this.zone.run(() => {
        // Only show public broadcast if we are currently in Public Chat
        if (!this.selectedUser) {
          if (!this.messages.some(m => m._id === msg._id)) {
            this.messages.push(msg);
            this.cdr.detectChanges();
            this.scrollToBottom();
          }
        } else {
          // Agar hum private chat me hain aur public message aaya to count badhao
          if (msg.username !== this.currentUser) {
            this.unreadCounts = { ...this.unreadCounts, 'public': (this.unreadCounts['public'] || 0) + 1 };
            this.cdr.detectChanges();
          }
        }
      });
    });

    this.socket.socket.on('privateMessage', (msg: ChatMessage) => {
      this.zone.run(() => {
        // Only show message if we are chatting with that specific user
        if (
          (msg.username === this.selectedUser && msg.receiver === this.currentUser) ||
          (msg.username === this.currentUser && msg.receiver === this.selectedUser)
        ) {
          if (!this.messages.some(m => m._id === msg._id)) {
            this.messages.push(msg);
            this.cdr.detectChanges();
            this.scrollToBottom();
          }
        } else {
          // Agar kisi aur user ka private message aaya to uska unread count badhao
          if (msg.receiver === this.currentUser && msg.username !== this.currentUser) {
            const sender = msg.username!;
            this.unreadCounts = { ...this.unreadCounts, [sender]: (this.unreadCounts[sender] || 0) + 1 };
            this.cdr.detectChanges();
          }
        }
      });
    });

    this.socket.socket.on('messageDeleted', (id: string) => {
      this.zone.run(() => {
        this.messages = this.messages.filter(m => m._id !== id);
        this.cdr.detectChanges();
      });
    });
  }

  async loadMessages() {
    try {
      let url = `${environment.apiUrl}/messages`;
      if (this.selectedUser) {
        url += `?sender=${this.currentUser}&receiver=${this.selectedUser}`;
      }
      
      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        this.zone.run(() => {
          this.messages = data;
          this.cdr.detectChanges();
          this.scrollToBottom();
        });
      }
    } catch (error) {
      console.error('Failed to fetch messages API', error);
    }
  }

  selectUser(username: string | null) {
    if (username === this.currentUser) return; // Prevent chatting with self
    this.selectedUser = username;
    
    // Chat select karte hi notification badge hata do
    if (username === null) {
      this.unreadCounts = { ...this.unreadCounts, 'public': 0 };
    } else {
      this.unreadCounts = { ...this.unreadCounts, [username]: 0 };
    }
    this.loadMessages();
  }

  async deleteMessage(messageId: string | undefined) {
    if (!messageId) return;
    try {
      const response = await fetch(`${environment.apiUrl}/messages/${messageId}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        console.error('Failed to delete message via API');
      }
    } catch (err) {
      console.error('Failed to delete message via API:', err);
    }
  }

  async send() {
    if (!this.message.trim() || !this.currentUser) return;
    
    const msgText = this.message.trim();
    this.message = ''; // Clear input immediately for better UX

    // Send to REST API
    try {
      const response = await fetch(`${environment.apiUrl}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: this.currentUser,
          text: msgText,
          receiver: this.selectedUser
        })
      });

      if (response.ok) {
        const newMsg = await response.json();
        this.zone.run(() => {
          if (!this.messages.some(m => m._id === newMsg._id)) {
            this.messages.push(newMsg);
            this.cdr.detectChanges();
            this.scrollToBottom();
          }
        });
      }
    } catch (err) {
      console.error('Failed to send message via API:', err);
    }
  }
  
  scrollToBottom(): void {
    // Timeout ensures DOM is fully updated before scrolling down
    setTimeout(() => {
      try {
        this.myScrollContainer.nativeElement.scrollTop = this.myScrollContainer.nativeElement.scrollHeight;
      } catch(err) { }
    }, 50);
  }

  ngOnDestroy() {
    // Socket listeners ko remove karna zaroori hai taaki component reload hone par duplicate events fire na hon
    this.socket.socket.off('message');
    this.socket.socket.off('users');
    this.socket.socket.off('messageDeleted');
    this.socket.socket.off('privateMessage');
  }

  logout() {
    this.authService.logout();
    this.router.navigate(['/']);
  }
}