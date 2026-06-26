import { Routes } from '@angular/router';
import { Login } from './features/auth/pages/login/login';
import { Chat } from './features/chat/pages/chat/chat';
import { authGuard, guestGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  { path: '', component: Login, canActivate: [guestGuard] },
  { path: 'chat', component: Chat, canActivate: [authGuard] }
];