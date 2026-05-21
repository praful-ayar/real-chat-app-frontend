import { Component, Inject } from '@angular/core';
import { MAT_SNACK_BAR_DATA, MatSnackBarRef } from '@angular/material/snack-bar';
import { MatButtonModule } from '@angular/material/button';

@Component({
  selector: "app-snackbar",
  imports: [MatButtonModule],
  templateUrl: "./snackbar.html",
  styleUrl: "./snackbar.css",
})
export class SnackbarComponent {
  constructor(
    @Inject(MAT_SNACK_BAR_DATA) public data: { message: string },
    public snackBarRef: MatSnackBarRef<SnackbarComponent>
  ) {}
}
