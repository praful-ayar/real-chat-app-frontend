import { Component, inject, ChangeDetectorRef, ElementRef, ViewChild, AfterViewInit, OnDestroy } from '@angular/core';
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
export class Login implements AfterViewInit, OnDestroy {

  @ViewChild('plexusCanvas') canvasRef!: ElementRef<HTMLCanvasElement>;
  private animationFrameId: number | null = null;
  private mouse = { x: -1000, y: -1000 };
  private cleanupCanvas: (() => void) | null = null;

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

  ngAfterViewInit() {
    const canvas = this.canvasRef.nativeElement;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    const trackMouse = (e: MouseEvent) => {
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
    };
    window.addEventListener('mousemove', trackMouse);

    const trackMouseLeave = () => {
      this.mouse.x = -1000;
      this.mouse.y = -1000;
    };
    window.addEventListener('mouseleave', trackMouseLeave);

    const particles: Array<{
      x: number;
      y: number;
      vx: number;
      vy: number;
      r: number;
      color: string;
    }> = [];

    const colors = ['#0d9488', '#0284c7', '#34d399', '#0f766e'];
    for (let i = 0; i < 70; i++) {
      particles.push({
        x: Math.random() * window.innerWidth,
        y: Math.random() * window.innerHeight,
        vx: (Math.random() - 0.5) * 0.9,
        vy: (Math.random() - 0.5) * 0.9,
        r: Math.random() * 2.5 + 1.2,
        color: colors[Math.floor(Math.random() * colors.length)]
      });
    }

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;

        if (p.x < 0 || p.x > canvas.width) p.vx *= -1;
        if (p.y < 0 || p.y > canvas.height) p.vy *= -1;

        if (this.mouse.x > -500) {
          const dx = this.mouse.x - p.x;
          const dy = this.mouse.y - p.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 180) {
            p.x += (dx / dist) * 0.25;
            p.y += (dy / dist) * 0.25;
          }
        }

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = 0.45;
        ctx.fill();
      }

      ctx.globalAlpha = 0.12;
      for (let i = 0; i < particles.length; i++) {
        const p1 = particles[i];
        for (let j = i + 1; j < particles.length; j++) {
          const p2 = particles[j];
          const dx = p1.x - p2.x;
          const dy = p1.y - p2.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < 110) {
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.strokeStyle = '#0d9488';
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        }
      }

      this.animationFrameId = requestAnimationFrame(draw);
    };

    draw();

    this.cleanupCanvas = () => {
      window.removeEventListener('resize', resizeCanvas);
      window.removeEventListener('mousemove', trackMouse);
      window.removeEventListener('mouseleave', trackMouseLeave);
    };
  }

  ngOnDestroy() {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }
    if (this.cleanupCanvas) {
      this.cleanupCanvas();
    }
  }
}