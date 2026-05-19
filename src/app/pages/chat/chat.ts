import { Component, NgZone, OnInit, OnDestroy, ChangeDetectorRef, ViewChild, ElementRef, HostListener, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';

import { MatToolbarModule } from '@angular/material/toolbar';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatListModule } from '@angular/material/list';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatCardModule } from '@angular/material/card';
import { MatSelectModule } from '@angular/material/select';
import { MatOptionModule } from '@angular/material/core';

import { SocketService } from '../../services/socket.service';
import { AuthService } from '../../services/auth.service';
import { environment } from '../../environments/environment';
import { EmojiPickerComponent } from '../../shared/emoji-picker/emoji-picker';

export interface ChatMessage {
  _id?: string;        // Added for message deletion support
  user?: string;       // Compatibility with socket
  username?: string;   // New API payload support
  email?: string;
  firstname?: string; // New API payload support
  lastname?: string; // New API payload support
  profileImage?: string; // New avatar
  message?: string;    // Compatibility with socket
  text?: string;       // New API payload support
  receiver?: string;   // Private message receiver
  timestamp?: Date | string | number;
  // Reply functionality fields
  replyTo?: string;
  replyToText?: string;
  replyToSender?: string;
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
    MatMenuModule,
    MatCardModule,
    MatSelectModule,
    MatOptionModule,
    EmojiPickerComponent
  ],
  templateUrl: './chat.html',
  styleUrls: ['./chat.css']
})
export class Chat implements OnInit, OnDestroy {

  @ViewChild('scrollMe') private myScrollContainer!: ElementRef;
  @ViewChild('messageInput') messageInput!: ElementRef;
  @ViewChild('emojiToggleButton', { read: ElementRef }) emojiToggleButton!: ElementRef;
  @ViewChild('emojiPicker', { read: ElementRef }) emojiPicker!: ElementRef;
  @ViewChild('video') video!: ElementRef;
  @ViewChild('canvas') canvas!: ElementRef;

  stream: any;
  message = '';
  messages: ChatMessage[] = [];
  users: any[] = [];
  currentUser: string | null = null;
  currentUserName: string | null = null;
  selectedUser: string | null = null; // null = public chat, string = private chat
  selectedUserName: string | null = null;
  selectedUserImage: string | null = null;
  unreadCounts: { [key: string]: number } = {};

  profileImage: string | null = null;
  showProfileSettings = false;
  editFirstname = '';
  editLastname = '';

  showEmojis = false;
  showCamera = false;

  typingUsers: string[] = [];
  typingTimeout: any;

  replyingToMessage: ChatMessage | null = null;
  autoTranslate: boolean = false;
  isTranslating: boolean = false;
  targetLanguage: string = 'English'; // Default language
  availableLanguages: string[] = ['English', 'Hindi', 'Gujarati', 'Marathi', 'Bengali', 'Spanish', 'French', 'German'];

  constructor(
    private socket: SocketService,
    private zone: NgZone,
    private cdr: ChangeDetectorRef,
    private router: Router,
    private authService: AuthService
  ) { }

  async ngOnInit() {
    this.currentUser = localStorage.getItem('user');
    const fname = localStorage.getItem('firstname') || '';
    const lname = localStorage.getItem('lastname') || '';
    this.currentUserName = `${fname} ${lname}`.trim() || this.currentUser;
    this.profileImage = localStorage.getItem('profileImage');

    if (this.currentUser) {
      this.socket.join(this.currentUser);
    } else {
      console.warn('No user found in localStorage. Please log in.');
      this.router.navigate(['/']);
      return;
    }

    // Restore selected user state from local storage on refresh
    const savedSelectedUser = localStorage.getItem('selectedUserEmail');
    if (savedSelectedUser) {
      this.selectedUser = savedSelectedUser;
      const sfname = localStorage.getItem('selectedUserFirstname') || '';
      const slname = localStorage.getItem('selectedUserLastname') || '';
      this.selectedUserName = `${sfname} ${slname}`.trim() || savedSelectedUser;
      this.selectedUserImage = localStorage.getItem('selectedUserProfileImage') || null;
    }

    // Restore unread counts from local storage
    const savedUnreadCounts = localStorage.getItem('unreadCounts');
    if (savedUnreadCounts) {
      try {
        this.unreadCounts = JSON.parse(savedUnreadCounts);
      } catch (e) {
        this.unreadCounts = {}; // Reset if data is corrupt
      }
    }

    // Load messages (will automatically load private chat if restored above)
    this.loadMessages();

    this.socket.onUsers((u: any[]) => {
      this.zone.run(() => {
        this.users = u.filter(user => user.email !== this.currentUser);
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
          if ((msg.email || msg.username || msg.user) !== this.currentUser) {
            this.unreadCounts = { ...this.unreadCounts, 'public': (this.unreadCounts['public'] || 0) + 1 };
            localStorage.setItem('unreadCounts', JSON.stringify(this.unreadCounts));
            this.cdr.detectChanges();
          }
        }
      });
    });

    this.socket.socket.on('privateMessage', (msg: ChatMessage) => {
      this.zone.run(() => {
        // Only show message if we are chatting with that specific user
        if (
          (msg.email === this.selectedUser && msg.receiver === this.currentUser) ||
          (msg.email === this.currentUser && msg.receiver === this.selectedUser)
        ) {
          if (!this.messages.some(m => m._id === msg._id)) {
            this.messages.push(msg);
            this.cdr.detectChanges();
            this.scrollToBottom();
          }
        } else {
          // Agar kisi aur user ka private message aaya to uska unread count badhao
          if (msg.receiver === this.currentUser && msg.email !== this.currentUser) {
            const sender = msg.email!;
            this.unreadCounts = { ...this.unreadCounts, [sender]: (this.unreadCounts[sender] || 0) + 1 };
            localStorage.setItem('unreadCounts', JSON.stringify(this.unreadCounts));
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

    this.socket.socket.on('typing', (data: { sender: string, senderName: string, receiver: string | null }) => {
      this.zone.run(() => {
        if (data.receiver === this.currentUser && this.selectedUser === data.sender) {
          if (!this.typingUsers.includes(data.senderName)) this.typingUsers.push(data.senderName);
        } else if (!data.receiver && !this.selectedUser) {
          if (!this.typingUsers.includes(data.senderName)) this.typingUsers.push(data.senderName);
        }
        this.cdr.detectChanges();
        this.scrollToBottom();
      });
    });

    this.socket.socket.on('stopTyping', (data: { sender: string, senderName: string, receiver: string | null }) => {
      this.zone.run(() => {
        this.typingUsers = this.typingUsers.filter(name => name !== data.senderName);
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

  selectUser(email: string | null, firstname?: string, lastname?: string, profileImage?: string) {
    if (email === this.currentUser) return; // Prevent chatting with self
    this.selectedUser = email;
    if (email === null) {
      this.selectedUserName = null;
      this.selectedUserImage = null;
      localStorage.removeItem('selectedUserEmail');
      localStorage.removeItem('selectedUserFirstname');
      localStorage.removeItem('selectedUserLastname');
      localStorage.removeItem('selectedUserProfileImage');
    } else {
      this.selectedUserName = `${firstname || ''} ${lastname || ''}`.trim() || email;
      this.selectedUserImage = profileImage || null;
      localStorage.setItem('selectedUserEmail', email);
      localStorage.setItem('selectedUserFirstname', firstname || '');
      localStorage.setItem('selectedUserLastname', lastname || '');
      if (profileImage) {
        localStorage.setItem('selectedUserProfileImage', profileImage);
      } else {
        localStorage.removeItem('selectedUserProfileImage');
      }
    }

    // Chat select karte hi notification badge hata do
    if (email === null) {
      this.unreadCounts = { ...this.unreadCounts, 'public': 0 };
    } else {
      this.unreadCounts = { ...this.unreadCounts, [email]: 0 };
    }
    localStorage.setItem('unreadCounts', JSON.stringify(this.unreadCounts));
    this.typingUsers = []; // Chat switch karne par pichli typing status clear kar do
    this.loadMessages();
  }

  toggleProfileSettings() {
    this.showProfileSettings = !this.showProfileSettings;
    if (this.showProfileSettings) {
      this.editFirstname = localStorage.getItem('firstname') || '';
      this.editLastname = localStorage.getItem('lastname') || '';
    }
  }

  onFileSelected(event: any) {
    const file = event.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e: any) => {
        this.zone.run(() => {
          this.profileImage = e.target.result; // Base64 encoding
          this.cdr.detectChanges(); // Force UI update for the preview
        });
      };
      reader.readAsDataURL(file);
    }
  }

  async saveProfile() {
    if (!this.currentUser) return;
    try {
      const res = await this.authService.updateProfile({
        email: this.currentUser,
        firstname: this.editFirstname,
        lastname: this.editLastname,
        profileImage: this.profileImage
      });
      this.currentUserName = `${res.firstname} ${res.lastname}`.trim();
      localStorage.setItem('firstname', res.firstname);
      localStorage.setItem('lastname', res.lastname);
      if (res.profileImage) {
        localStorage.setItem('profileImage', res.profileImage);
        this.profileImage = res.profileImage;
      } else {
        localStorage.removeItem('profileImage');
        this.profileImage = null;
      }
      this.toggleProfileSettings();
      this.cdr.detectChanges();

      // Notify socket server to update this user's profile across all connected clients
      this.socket.socket.emit('updateProfile', this.currentUser);
    } catch (err) {
      console.error('Failed to update profile:', err);
    }
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    // Agar picker khula hai aur click bahar hua hai to use band kar do
    if (this.showEmojis && this.emojiToggleButton && this.emojiPicker) {
      const clickedInsideButton = this.emojiToggleButton.nativeElement.contains(event.target as Node);
      const clickedInsidePicker = this.emojiPicker.nativeElement.contains(event.target as Node);

      if (!clickedInsideButton && !clickedInsidePicker) {
        this.zone.run(() => {
          this.showEmojis = false;
        });
      }
    }
  }

  toggleEmojis() {
    this.showEmojis = !this.showEmojis;
  }

  addEmoji(emoji: string) {
    this.message += emoji;
    this.messageInput.nativeElement.focus(); // Emoji select karne ke baad input field ko focus karein
  }

  startReply(message: ChatMessage) {
    this.replyingToMessage = message;
    this.messageInput.nativeElement.focus();
  }

  cancelReply() {
    this.replyingToMessage = null;
  }

  getReplySenderName(message: ChatMessage | null): string {
    if (!message) return '';
    return message.firstname || (message.email || message.user)?.split('@')[0] || 'User';
  }

  scrollToMessage(messageId: string | undefined) {
    if (!messageId) return;
    const element = document.getElementById(`msg-${messageId}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // Add a temporary highlight effect
      const messageBubble = element.querySelector('.message');
      if (messageBubble) {
        messageBubble.classList.add('highlight');
        setTimeout(() => messageBubble.classList.remove('highlight'), 1500);
      }
    }
  }

  onTyping() {
    if (!this.currentUser) return;

    this.socket.socket.emit('typing', {
      sender: this.currentUser,
      senderName: this.currentUserName,
      receiver: this.selectedUser
    });

    if (this.typingTimeout) clearTimeout(this.typingTimeout);

    this.typingTimeout = setTimeout(() => {
      this.socket.socket.emit('stopTyping', {
        sender: this.currentUser,
        senderName: this.currentUserName,
        receiver: this.selectedUser
      });
    }, 2000);
  }

  sendGifDirect(gifUrl: string) {
    if (gifUrl && gifUrl.trim() !== '') {
      const currentMsg = this.message;
      this.message = gifUrl.trim();
      this.send();
      // Agar user kuch type kar raha tha, to uska text wapas restore kar do
      setTimeout(() => { this.message = currentMsg; }, 100);
    }
  }

  isMedia(text: string | undefined): boolean {
    if (!text) return false;
    if (text.startsWith('data:image/')) return true; // Base64 Image Support
    const urlPattern = /^(http|https):\/\/[^ "]+$/;
    if (urlPattern.test(text)) {
      // Agar link .gif, .jpg hai ya Giphy/Tenor ka media link hai to true return karo
      return text.match(/\.(jpeg|jpg|gif|png|webp)$/i) != null || text.includes('media.giphy.com') || text.includes('media.tenor.com');
    }
    return false;
  }

  isOnlyEmoji(text: string | undefined): boolean {
    if (!text) return false;
    const trimmed = text.trim();
    if (trimmed.length === 0) return false;

    // This regex checks if the string consists ONLY of one or more emojis and whitespace.
    const emojiOnlyRegex = /^(\p{Emoji_Presentation}|\p{Extended_Pictographic}|\u200d|\ufe0f|\s)+$/u;

    // We also check that it's not just whitespace
    return emojiOnlyRegex.test(trimmed) && trimmed.replace(/\s/g, '').length > 0;
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
    if (!this.message.trim() || !this.currentUser || this.isTranslating) return;

    let textToSend = this.message.trim();
    this.message = ''; // Clear input immediately for better UX
    this.showEmojis = false; // Send karne ke baad emoji picker hide kar do

    if (this.autoTranslate && !this.isMedia(textToSend) && !this.isOnlyEmoji(textToSend)) {
      this.isTranslating = true;
      try {
        const transRes = await fetch(`${environment.apiUrl}/translate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: textToSend, targetLanguage: this.targetLanguage })
        });
        if (transRes.ok) {
          const transData = await transRes.json();
          if (transData.translatedText) textToSend = transData.translatedText;
        }
      } catch (err) {
        console.error("Translation error", err);
      } finally {
        this.isTranslating = false;
      }
    }

    const payload: any = {
      email: this.currentUser,
      text: textToSend,
      receiver: this.selectedUser
    };

    // Agar reply kar rahe hain, to payload me jankari add karein
    if (this.replyingToMessage) {
      payload.replyTo = this.replyingToMessage._id;
      payload.replyToText = this.replyingToMessage.text || this.replyingToMessage.message;
      payload.replyToSender = this.replyingToMessage.firstname || (this.replyingToMessage.email || this.replyingToMessage.user)?.split('@')[0];
    }

    // Jaise hi message send ho, typing status stop kar do
    if (this.typingTimeout) clearTimeout(this.typingTimeout);
    this.socket.socket.emit('stopTyping', {
      sender: this.currentUser,
      senderName: this.currentUserName,
      receiver: this.selectedUser
    });

    this.cancelReply(); // Reply state ko reset karein

    // Send to REST API
    try {
      const response = await fetch(`${environment.apiUrl}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
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
      } catch (err) { }
    }, 50);
  }

  ngOnDestroy() {
    // Socket listeners ko remove karna zaroori hai taaki component reload hone par duplicate events fire na hon
    this.socket.socket.off('message');
    this.socket.socket.off('users');
    this.socket.socket.off('messageDeleted');
    this.socket.socket.off('privateMessage');
    this.socket.socket.off('typing');
    this.socket.socket.off('stopTyping');
  }

  logout() {
    this.authService.logout();
    localStorage.removeItem('unreadCounts'); // Logout par unread counts clear kar do
    this.router.navigate(['/']);
  }

  async openCameraModal() {
    this.showCamera = true;
    this.cdr.detectChanges(); // Force render to make video element available
    await this.startCamera();
  }

  closeCameraModal() {
    this.stopCamera();
    this.showCamera = false;
  }

  async startCamera() {
    // Stop any existing stream before starting a new one
    this.stopCamera();
    this.stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 1280 },
        height: { ideal: 720 },
        facingMode: "user"
      }
    });

    this.video.nativeElement.srcObject = this.stream;
  }

  stopCamera() {
    if (this.stream) {
      this.stream.getTracks().forEach((t: any) => t.stop());
    }
  }

  capturePhoto() {
    const video = this.video.nativeElement;
    const canvas = this.canvas.nativeElement;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0);

    // Convert to base64 immediately and send
    const base64Image = canvas.toDataURL('image/jpeg', 0.8);
    this.closeCameraModal();
    this.sendImageDirect(base64Image);
  }

  sendImageDirect(base64Image: string) {
    if (base64Image && base64Image.trim() !== '') {
      const currentMsg = this.message;
      this.message = base64Image;
      this.send(); // Use standard REST sending mechanism so it saves to DB
      setTimeout(() => { this.message = currentMsg; }, 100);
    }
  }
}