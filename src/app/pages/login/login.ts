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
import { ErrorStateMatcher } from '@angular/material/core';
import { FormControl, FormGroupDirective, NgForm } from '@angular/forms';

export class SubmitErrorStateMatcher implements ErrorStateMatcher {
  isSubmitted = false;
  isErrorState(control: FormControl | null, form: FormGroupDirective | NgForm | null): boolean {
    return !!(control && control.invalid && this.isSubmitted);
  }
}
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

  matcher = new SubmitErrorStateMatcher();

  get isFormValid(): boolean {
    const isEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.email);
    if (this.isLoginMode) {
      return !!(isEmailValid && this.password.trim());
    }
    return !!(isEmailValid && this.firstname.trim() && this.lastname.trim() && this.password.trim() && this.confirmpassword.trim());
  }

  toggleMode() {
    this.isLoginMode = !this.isLoginMode;
    this.password = '';
    this.email = '';
    this.firstname = '';
    this.lastname = '';
    this.confirmpassword = '';
    this.matcher.isSubmitted = false;
  }

  async submit() {
    this.matcher.isSubmitted = true;
    const isEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.email);
    if (!isEmailValid || !this.password.trim()) return;

    if (this.isLoginMode) {
      if (!isEmailValid || !this.password.trim()) return;
    } else {
      if (!isEmailValid || !this.firstname || !this.lastname || !this.password.trim() || !this.confirmpassword.trim()) return;
      if (this.password.trim() !== this.confirmpassword.trim()) {
        this.snackBar.openFromComponent(SnackbarComponent, {
          data: { message: "Passwords do not match" },
          duration: 3000,
          horizontalPosition: 'center',
          verticalPosition: 'bottom',
          panelClass: ['error-snackbar']
        });
        return;
      }
    }

    this.isLoading = true;
    try {
      let res: any;
      if (this.isLoginMode) {
        res = await this.authService.login(this.email, this.password.trim());
        if (res && res.token) localStorage.setItem('token', res.token);
        if (res && res.email) localStorage.setItem('user', res.email);
        if (res && res.firstname) localStorage.setItem('firstname', res.firstname);
        if (res && res.lastname) localStorage.setItem('lastname', res.lastname);
        if (res && res.profileImage) localStorage.setItem('profileImage', res.profileImage);
        this.router.navigate(['/chat']);
      } else {
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
        this.toggleMode();
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