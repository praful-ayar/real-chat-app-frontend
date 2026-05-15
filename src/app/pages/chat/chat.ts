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
  user?: string;       // Compatibility with socket
  username?: string;   // New API payload support
  message?: string;    // Compatibility with socket
  text?: string;       // New API payload support
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

    // Load initial messages from REST API
    try {
      const response = await fetch(`${environment.apiUrl}/messages`);
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

    this.socket.onUsers((u: any[]) => {
      this.zone.run(() => {
        this.users = u;
        this.cdr.detectChanges(); // Turant UI update karega
      });
    });

    this.socket.onOldMessages((m: ChatMessage[]) => {
      this.zone.run(() => {
        this.messages = m;
        this.cdr.detectChanges();
        this.scrollToBottom();
      });
    });

    this.socket.onMessage((msg: ChatMessage) => {
      this.zone.run(() => {
        this.messages.push(msg);
        this.cdr.detectChanges();
        this.scrollToBottom();
      });
    });
  }

  async send() {
    if (!this.message.trim() || !this.currentUser) return;
    
    const msgText = this.message.trim();
    this.message = ''; // Clear input immediately for better UX

    // Send to REST API
    try {
      await fetch(`${environment.apiUrl}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: this.currentUser,
          text: msgText
        })
      });
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
    this.socket.socket.off('oldMessages');
    this.socket.socket.off('users');
  }

  logout() {
    this.authService.logout();
    this.router.navigate(['/']);
  }
}