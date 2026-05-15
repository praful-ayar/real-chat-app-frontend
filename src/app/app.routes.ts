import { Routes } from '@angular/router';
import { Login } from './pages/login/login';
import { Chat } from './pages/chat/chat';

export const routes: Routes = [
  { path: '', component: Login },
  { path: 'chat', component: Chat }
];