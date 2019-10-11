import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { NoopAnimationsModule, BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { NgbModule } from '@ng-bootstrap/ng-bootstrap';
import { NgSelectModule } from '@ng-select/ng-select';

import { AppComponent } from './app.component';
import { PiTable } from './table.component';

@NgModule({
  imports:      [ BrowserModule, NgbModule, NgSelectModule, FormsModule, ReactiveFormsModule, BrowserAnimationsModule ],
  declarations: [ AppComponent, PiTable ],
  bootstrap:    [ AppComponent ]
})
export class AppModule { }
