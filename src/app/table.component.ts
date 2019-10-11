import { Attribute, Directive, ElementRef, Input, Renderer2, TemplateRef, ViewContainerRef, EmbeddedViewRef, Component, ChangeDetectorRef, OnChanges, QueryList, ViewChildren, SimpleChanges, ChangeDetectionStrategy, TrackByFunction, Output, EventEmitter } from "@angular/core";

export enum Sort {
  ASC = 0, DESC = 1, NONE = 2
}

export class Row {
  constructor(
    public item: any,
    public index: number = null,
    public content: string = null,
    public matched = false,
    public paged = false,
    public hidden = true,
    public selected = false,
    public anchor = false
  ){}
}

@Component({
  selector: '[piTable]',
  template: `
    <ul>
      <li *ngFor="let row of rows; trackBy: trackByFn" [hidden]="!row.paged" #rowEl [class.text-success]="row.anchor">
        <button class="btn p-0 btn-link" [class.text-success]="row.selected" (click)="toggleRowsSelection(row)">{{row.item.name.first}} <small>[{{row.item.index}}]</small></button>
      </li>
    </ul>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PiTable implements OnChanges {
  @Input('piTable')
  items: any[];
  @Input()
  filter: string;
  @Input()
  sort: Sort;
  @Input()
  page: number;
  @Input()
  pageSize: number = 10;
  @Input()
  selection: any[];
  @Input()
  selectionMode: 'single' | 'multi' = 'multi';
  @Input()
  stickySelection = true;
  @Input()
  alwaysOneSelection = false;
  @Input('trackBy')
  trackByFn: TrackByFunction<any> = null;

  @Output()
  pageChange = new EventEmitter<number>(true)
  @Output()
  pageCountChange = new EventEmitter<number>(true)
  @Output()
  selectionChange = new EventEmitter<any[]>()

  rows: Row[];
  protected _pageCount: number;

  protected tasks = {};
  // row index => matched index
  protected displayIndices: Map<number, number>
  protected stickyItem: any;
  protected selectionAnchor: number;
  protected _rowElements: QueryList<ElementRef>
  protected pageInfo: any;

  constructor(protected cd: ChangeDetectorRef) {
    this.buildPageInfo();
  }

  protected buildPageInfo() {
      let page = this.page != null ? Math.max(this.page, 1) : null;
      let pageSize = this.pageSize != null ? Math.max(this.pageSize, 0) : null;
      let disabled = page == null || page < 0 || pageSize == null;
      let minIndex = disabled ? 0 : (page - 1) * pageSize;
      let maxIndex = disabled ? null : minIndex + pageSize;

      this.pageInfo = {
        disabled,
        page,
        pageSize,
        minIndex,
        maxIndex,
        inRange: (idx: number) => minIndex <= idx && (!maxIndex || idx < maxIndex)
      }
  } 

  get displayedRowCount() {
    return this.displayIndices ? this.displayIndices.size : this.rows.length;
  }

  protected updatePageCount() {
    if (!this.pageInfo.disabled) {
      this._pageCount = this.getPageForIndex(this.displayedRowCount);
      this.pageCountChange.emit(this.pageCount);
    }
  }

  protected getPageForIndex(idx: number) {
    return idx == 0 ? 1 : Math.ceil(idx / this.pageSize);
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes.items || changes.filter) {
      this.rebuildRows();
    }
    if (changes.sort) {
      if (this.sort == Sort.NONE) {
        this.rebuildRows();
      }
      else {
        this.schedule('sort', this.renderSort);
      }
    }
    if (changes.page || changes.pageSize) {
      this.buildPageInfo();
      this.schedule('page', this.renderPage);
    }
    if (changes.selection) {
      this.schedule('selection', this.renderSelection);
    }
  }

  ngAfterViewChecked() {
    // console.log('ngAfterViewChecked');
    this.runTasks();
  }

  @ViewChildren('rowEl')
  set rowElements(value: QueryList<ElementRef>) {
    this._rowElements = value;
  }

  protected schedule(type: string, fn: any) {
    this.tasks[type] = fn.bind(this);
  }

  protected runTasks() {
    let runnable = ['content', 'filter', 'sort', 'selection', 'page'];
    console.log('runTasks', Object.keys(this.tasks).filter(t => runnable.indexOf(t) != -1));

    runnable.forEach(type => {
      let t = this.tasks[type];
      if (t) {
        t();
      }
    })
    this.tasks = {};
  }

  protected hasTask(type: string) {
    return type in this.tasks;
  }

  protected prepareStickySelection() {
    if (this.stickySelection && this.rows && !this.pageInfo.disabled) {
      if (this.displayedRowCount > 0) {
        this.stickyItem = null;
      }
      
      if (this.displayedRowCount > 0) {
        let displayIndices = Array.from(this.displayIndices.keys());

        for (let i = this.pageInfo.minIndex; i < this.pageInfo.maxIndex; ++i) {
          let displayIndex = displayIndices[i];

          if (!displayIndex) {
            // we reached the end of the renderered page
            break;
          }

          let pagedRow = this.rows[displayIndex];

          if (pagedRow.anchor) {
            this.stickyItem = pagedRow.item;
          }
        }
      }
    }
  }

  protected rebuildRows() {
    this.prepareStickySelection();

    let items = this.items || [];

    this.rows = items.map((it, i) => new Row(it, i));
    this.displayIndices = null;
    this.updatePageCount();

    this.schedule('content', this.readContent);
    this.schedule('filter', this.renderFiltered);
    this.schedule('sort', this.renderSort);
    this.schedule('selection', this.renderSelection);
    this.schedule('page', this.renderPage);
  }

  protected readContent() {
    this._rowElements.forEach((el, i) => {
      let row = this.rows[i];
      row.content = (el.nativeElement as HTMLElement).textContent;
    })
  }

  protected renderFiltered() {
    let term = this.filter ? this.filter.toLowerCase() : null;
    let displayIndices = new Map();
    
    this.rows.forEach((row, i) => {
      row.matched = !term || row.content.toLowerCase().match(term) != null;

      if (row.matched) {
        displayIndices.set(i,  displayIndices.size);
      }
    })

    this.displayIndices = displayIndices;
    this.updatePageCount();

    if (this.stickyItem == null) {
      if (this.page > this._pageCount) {
        this.gotoIndex(this.displayedRowCount);
      }
    }
    else {
      let finder = this.elementPredicate(this.stickyItem);
      let stickyIndex = this.displayIndices.get(this.rows.findIndex(r => finder(r.item)));

      if (stickyIndex != null) {
        this.gotoIndex(stickyIndex);
        this.stickyItem = null;
      }
    }

    this.schedule('page', this.renderPage);
    this.cd.detectChanges();
  }

  protected renderSort() {
    if (this.sort != Sort.NONE) {
      this.rows.sort((a, b) => {
        return a.content.localeCompare(b.content) * (this.sort == Sort.ASC ? 1 : -1);
      })

      this.cd.detectChanges();
    }
  }

  protected renderSelection() {    
    let hasSelection = this.selection && this.selection.length > 0;

    this.rows.forEach((row, rowIdx) => {
      let idx = !hasSelection ? -1 : this.findIndexIn(this.selection, row.item);
      row.selected = idx != -1;

      if (!row.selected) {
        row.anchor = false;
      }
      else if (hasSelection) {
        row.anchor = idx == this.selection.length - 1;
      }
    })

    this.cd.detectChanges();
  }

  protected renderPage() {   
    this.rows.forEach((row, i) => {
      let idx = this.displayIndices ? this.displayIndices.get(i) : i;
      row.paged = idx != null && (this.pageInfo.disabled || this.pageInfo.inRange(idx));
    })

    this.cd.detectChanges();
  }

  protected gotoIndex(displayIndex: number) {
      this.page = this.getPageForIndex(displayIndex);
      this.buildPageInfo();
      this.pageChange.emit(this.page);
  }

  toggleRowsSelection(row: Row) {
    // if selectable
    let selection = this.selection || [];
    
    if (this.selectionMode == 'single') {
      selection.length = 0;
    };

    let previousIdx = selection.findIndex(selectedItem => selectedItem == row.item);
    let adding = previousIdx == -1;

    if (adding) {
      selection.push(row.item);
    }
    else if (!this.alwaysOneSelection || selection.length > 1) {
      selection.splice(previousIdx, 1);
    }

    this.selection = selection;
    this.selectionChange.emit(this.selection);
    this.schedule('selection', this.renderSelection);
  }
   
  protected elementPredicate(target: any): (value: any, index?: number, obj?: any[]) => boolean {
      if (this.trackByFn == null) {
          return (it: any) => it == target;
      }
      else {
          let trackedTarget = this.trackByFn(-1, target);
          return (it: any, i: number) => this.trackByFn(i, it) == trackedTarget
      }
  }
 
  protected findIndexIn(arr: any[], it: any): number {
      return arr.findIndex(this.elementPredicate(it));
  }

  get pageCount() {
    return this._pageCount;
  }

}