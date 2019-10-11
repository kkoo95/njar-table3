import { Attribute, Directive, ElementRef, Input, Renderer2, TemplateRef, ViewContainerRef, EmbeddedViewRef, Component, ChangeDetectorRef, OnChanges, QueryList, ViewChildren, SimpleChanges, ChangeDetectionStrategy, TrackByFunction, Output, EventEmitter } from "@angular/core";
import { LocationStrategy } from "@angular/common";
import { ActivatedRoute, Router, RouterLink, RouterLinkWithHref } from "@angular/router";
import { Observable, of } from 'rxjs';
import { Sort } from './table.component';
import data from './data';

@Component({
  selector: 'my-app',
  templateUrl: './app.component.html',
  styleUrls: [ './app.component.scss' ]
})
export class AppComponent  {
  items = data;//.slice(0, 100);
  filter = '';
  sort = Sort.NONE;
  selection: any[];// = [this.items[3], this.items[16]];
  duplicateData = true;
  page = 5;
  pageSize = 16;
  pageCount = 0;

  protected from = 0;
  protected to = 0;

lol() {
  this.duplicateData = !this.duplicateData;
}
  changeSort() {
    this.sort = (this.sort + 1) % 3
  }

  get selectionIds() {
    return this.selection == null ? '' : this.selection.map(e => e.index + '_' + e.name.first).join(', ');
  }

  clearSelection() {
    this.selection = [];
  }

  selectAll() {
    this.selection = [];
    for (let i = 0; i < this.items.length; ++i) {
      this.selection.push(this.items[i]);
    }
  }
  selectItem(index: number) {
    this.selection = [...this.selection, this.items[index]];
  }

  trackByFn(index, item) {
    return item._id
  }

  rollData() {
    if (this.items == null) {
      this.items = data.slice();
    }
    else {
      const min = 3;
      let fullLen = 10;//data.length; 
      let start = Math.floor(Math.random() * (fullLen - min));
      let remainingLen = fullLen - start;
      let len = Math.floor(Math.random() * (remainingLen - min)) + min;
      let end = start + len;
      
      console.log('rollData', start, end);

      let items = data.slice(start, end);

      this.items = items.map((e, i) => {
        return this.readData(i, items);
      })
    }
  }

  nextSliceData() {
    const size = 4;

    this.from = this.to;
    this.to = ((this.to + size) % data.length)

    if (this.from > this.to) {
      this.from = 0;
      this.to = size;
    }

    this.sliceData(this.from, this.to);
  }

  protected readData(i:number, arr: any[] = data) {
      return this.duplicateData ? JSON.parse(JSON.stringify(arr[i])) : arr[i];
  }

  oneThirdData() {
    this.sliceData(0, Math.floor(data.length / 3));
  }

  twoThirdData() {
    this.sliceData(0, Math.floor(2 * data.length / 3));
  }

  allData() {
    this.sliceData(0, data.length);
  }

  sliceData(from: number, to: number) {
    let items = [];
    for (let i = from; i < data.length && i < to; ++i) {
      items.push(this.readData(i));
    }
    this.items = items;
  }
}
