import { Component, OnInit } from '@angular/core';
import { AuthService } from './shared/services/auth.service';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent implements OnInit {
  title = 'RAG Application';

  constructor(private authService: AuthService) {}

  ngOnInit(): void {
    this.authService.ensureValidSession();
  }
}

