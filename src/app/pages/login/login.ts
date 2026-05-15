import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../services/auth.service';

@Component({
  selector:'app-login',
  standalone:true,
  imports:[
    CommonModule,
    FormsModule,
    MatCardModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule
  ],
  templateUrl:'./login.html',
  styleUrls: ['./login.css']
})
export class Login{

  private router = inject(Router);
  private authService = inject(AuthService);

  isLoginMode = true;
  isLoading = false;
  username='';
  password='';

  toggleMode() {
    this.isLoginMode = !this.isLoginMode;
    this.username = '';
    this.password = '';
  }

  async submit(){
    if (!this.username.trim() || !this.password.trim()) return;

    this.isLoading = true;
    try {
      let res: any;
      if (this.isLoginMode) {
        res = await this.authService.login(this.username.trim(), this.password.trim());
      } else {
        res = await this.authService.register(this.username.trim(), this.password.trim());
      }
      
      if (res && res.token) localStorage.setItem('token', res.token);
      if (res && res.username) localStorage.setItem('user', res.username);
      
      this.router.navigate(['/chat']);
    } catch (err: any) {
      alert(err.message || 'Authentication failed');
    } finally {
      this.isLoading = false;
    }
  }
}