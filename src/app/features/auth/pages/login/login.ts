import { Component, inject, ChangeDetectorRef } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { CommonModule } from '@angular/common';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ErrorStateMatcher } from '@angular/material/core';
import { FormControl, FormGroupDirective, NgForm } from '@angular/forms';
import { AuthService } from '../../../../core/services/auth.service';
import { SnackbarComponent } from '../../../../shared/components/snackbar/snackbar';

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

  // Industry Best Practice: Regex ko separate property mein rakhein for reusability
  private readonly emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  get isEmailValid(): boolean {
    return this.emailRegex.test(this.email);
  }

  get isFormValid(): boolean {
    if (this.isLoginMode) {
      return !!(this.isEmailValid && this.password.trim());
    }
    return !!(this.isEmailValid && this.firstname.trim() && this.lastname.trim() && this.password.trim() && this.confirmpassword.trim());
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

  // Industry Best Practice: Reusable method for snackbar handling
  private showSnackbar(message: string, isError: boolean = false) {
    this.snackBar.openFromComponent(SnackbarComponent, {
      data: { message },
      duration: 3000,
      horizontalPosition: 'center',
      verticalPosition: 'bottom',
      panelClass: [isError ? 'error-snackbar' : 'success-snackbar']
    });
  }

  async submit() {
    this.matcher.isSubmitted = true;
    if (!this.isFormValid) return;

    if (!this.isLoginMode && this.password.trim() !== this.confirmpassword.trim()) {
      this.showSnackbar("Passwords do not match", true);
      return;
    }

    this.isLoading = true;
    try {
      let res: any;
      if (this.isLoginMode) {
        res = await this.authService.login(this.email, this.password.trim());
        // Note: Ek standard architecture mein LocalStorage ka logic AuthService ya TokenService mein hona chahiye.
        if (res) {
          if (res.token) localStorage.setItem('token', res.token);
          if (res.email) localStorage.setItem('user', res.email);
          if (res.firstname) localStorage.setItem('firstname', res.firstname);
          if (res.lastname) localStorage.setItem('lastname', res.lastname);
          if (res.profileImage) localStorage.setItem('profileImage', res.profileImage);
        }
        this.router.navigate(['/chat']);
      } else {
        res = await this.authService.register({
          email: this.email,
          firstname: this.firstname,
          lastname: this.lastname,
          password: this.password,
          confirmpassword: this.confirmpassword
        });
        this.showSnackbar('Registration successful! Please login.', false);
        this.toggleMode();
      }
    } catch (err: any) {
      this.showSnackbar(err.message || 'Authentication failed', true);
    } finally {
      this.isLoading = false;
      this.cdr.detectChanges();
    }
  }
}