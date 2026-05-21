import { Routes } from '@angular/router';
import { Login } from './features/auth/pages/login/login';
import { Chat } from './features/chat/pages/chat/chat';

export const routes: Routes = [
  { path: '', component: Login },
  { path: 'chat', component: Chat }
];