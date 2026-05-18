import { Component, inject, ChangeDetectorRef } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../services/auth.service';
import { SnackbarComponent } from "../../shared/snackbar/snackbar";
import { MatSnackBar } from '@angular/material/snack-bar';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatCardModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
  ],
  templateUrl: './login.html',
  styleUrls: ['./login.css']
})
export class Login {

  private router = inject(Router);
  private authService = inject(AuthService);
  private snackBar = inject(MatSnackBar);
  private cdr = inject(ChangeDetectorRef);

  isLoginMode = true;
  isLoading = false;
  // username='';
  password = '';
  email = '';
  firstname = '';
  lastname = '';
  confirmpassword = '';




  toggleMode() {
    this.isLoginMode = !this.isLoginMode;
    // this.username = '';
    this.password = '';
    this.email = '';
    this.firstname = '';
    this.lastname = '';
    this.confirmpassword = '';
  }

  async submit() {
    // if (!this.username.trim() || !this.password.trim()) return;
    if (!this.email || !this.password.trim()) return;

    this.isLoading = true;
    try {
      let res: any;
      if (this.isLoginMode) {
        // res = await this.authService.login(this.username.trim(), this.password.trim());
        res = await this.authService.login(this.email, this.password.trim());
        if (res && res.token) localStorage.setItem('token', res.token);
        if (res && res.email) localStorage.setItem('user', res.email);
        if (res && res.firstname) localStorage.setItem('firstname', res.firstname);
        if (res && res.lastname) localStorage.setItem('lastname', res.lastname);
        if (res && res.profileImage) localStorage.setItem('profileImage', res.profileImage);
        this.router.navigate(['/chat']);
      } else {
        // res = await this.authService.register(this.username.trim(), this.password.trim());
        res = await this.authService.register({
          email: this.email,
          firstname: this.firstname,
          lastname: this.lastname,
          password: this.password,
          confirmpassword: this.confirmpassword
        });
        this.snackBar.openFromComponent(SnackbarComponent, {
          data: { message: 'Registration successful! Please login.' },
          duration: 3000,
          horizontalPosition: 'center',
          verticalPosition: 'bottom',
          panelClass: ['success-snackbar']
        });
        this.toggleMode(); // Successful register ke baad automatically login form open karne ke liye
      }
    } catch (err: any) {
      this.isLoading = false;
      this.snackBar.openFromComponent(SnackbarComponent, {
        data: { message: err.message || 'Authentication failed' },
        duration: 3000,
        horizontalPosition: 'center',
        verticalPosition: 'bottom',
        panelClass: ['error-snackbar']
      });
    } finally {
      this.isLoading = false;
      this.cdr.detectChanges();
    }
  }
}