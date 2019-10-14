import { Attribute, Directive, ElementRef, Input, Renderer2, TemplateRef, ViewContainerRef, EmbeddedViewRef, Component, ChangeDetectorRef, OnChanges, QueryList, ViewChildren, SimpleChanges, ChangeDetectionStrategy, TrackByFunction, Output, EventEmitter, ContentChild } from "@angular/core";
import { NgForOfContext } from "@angular/common";

export enum Sort {
  ASC = 0, DESC = 1, NONE = 3
}

export class Row {
  protected _item: any;
  public templateContext = new NgForOfContext(null, null, null, null);

  constructor(
    item: any,
    public index: number = null,
    public content: string = null,
    public matched = false,
    public paged = false,
    public selected = false,
    public anchor = false,
  ) {
    this.item = item;
  }

  get item() {
    return this.templateContext.$implicit;
  }

  set item(value: any) {
    this.templateContext.$implicit = value;
  }
}

@Component({
  selector: '[piTable2]',
  template: `
    <ul>
      <li #rowEl *ngFor="let row of rows; index as i; trackBy: trackByFn"
        [hidden]="!row.paged"
        [class.clickable]="selectable"
        [class.text-success]="row.selected"
        [class.text-danger]="row.anchor"
        (click)="toggleRowsSelection(row)">
          <ng-container [ngTemplateOutlet]="rowTemplate" [ngTemplateOutletContext]="row.templateContext"></ng-container>
      </li>
    </ul>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PiTable2Component implements OnChanges {
  @Input('piTable2')
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
  keepPage = true;
  @Input()
  selectable = true;
  @Input()
  selection: any[];
  @Input()
  selectionMode: 'single' | 'multi' = 'multi';
  @Input()
  stickySelection = true;
  @Input()
  alwaysOneSelection = false;
  @Input()
  keepSelection = false;
  @Input('trackBy')
  trackByFn: TrackByFunction<any> = null;

  @Output()
  pageChange = new EventEmitter<number>(true)
  @Output()
  pageCountChange = new EventEmitter<number>(true)
  @Output()
  selectionChange = new EventEmitter<any[]>(true)

  rows: Row[];
  protected _pageCount: number;

  protected tasks = {};
  // row index => matched index
  protected displayIndices: Map<number, number>
  protected stickyItem: any;
  protected selectionAnchor: number;
  protected _rowElements: QueryList<ElementRef>
  protected pageInfo: any;
  @ContentChild('piTableRowTemplate')
  protected rowTemplate: TemplateRef<ElementRef>;

  constructor(protected cd: ChangeDetectorRef) {
    this.buildPageInfo();
    window['t'] = this;
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
      this.updatePageCount();
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
    if (type != 'selection' || this.selectable) {
      this.tasks[type] = fn.bind(this);
    }
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

  get displayedRowCount() {
    return this.displayIndices ? this.displayIndices.size : this.rows.length;
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
        minIndex,
        maxIndex,
        inRange: (idx: number) => minIndex <= idx && (!maxIndex || idx < maxIndex)
      }
  } 

  protected updatePageCount() {
    if (!this.pagingDisabled) {
      this._pageCount = this.getPageForIndex(this.displayedRowCount);
      this.pageCountChange.emit(this.pageCount);
    }
  }

  protected getPageForIndex(idx: number) {
    return Math.ceil((idx + 1) / this.pageSize);
  }

  protected prepareStickySelection() {
    if (this.stickySelection && this.rows && this.displayIndices && !this.pagingDisabled) {
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

  protected stickToSelection() {
    if (!this.pagingDisabled) {
      let stickyIndex;

      if (this.stickyItem != null) {
        let predicate = this.elementPredicate(this.stickyItem);
        stickyIndex = this.displayIndices.get(this.rows.findIndex(r => predicate(r.item)));
      }

      if (stickyIndex != null) {
        this.stickyItem = null;
      }
      else if (!this.keepPage) {
        stickyIndex = 0;
      }
      else if (this.page > this._pageCount) {
        stickyIndex = this.displayedRowCount;
      }

      if (stickyIndex != null) {
        this.gotoIndex(stickyIndex);
      }
    }
  }

  protected cleanSelection(lookupArray: any[]) {
      if (this.hasSelection) {
          let newSelection = this.selection.filter(selected => {
              return this.findIndexIn(lookupArray, selected) !== -1
          });

          if (newSelection.length !== this.selection.length) {
              this.selection = newSelection;
          }
      }
  }
  
  protected rebuildRows() {
    this.prepareStickySelection();

    let items = this.items || [];
    
    this.rows = items.map((it, i) => {
      let row: Row;
      let predicate = this.elementPredicate(it);
      let oldRow = this.rows ? this.rows.find(r => predicate(r.item)) : null;

      if (oldRow == null) {
        row = new Row(it, i)
      }
      else {
        row = oldRow;
        row.index = i;
        row.item = it;
      }

      return row;
    });
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
    this.stickToSelection();
    
    if (this.hasSelection) {
      let newSelection = this.selection.filter(it => {
        let predicate = this.elementPredicate(it);
        return this.rows.find(r => {
          return (!this.keepSelection ? r.matched : true) && predicate(r.item);
        }) != null;
      })
      
      if (newSelection.length != this.selection.length) {
        this.selection = newSelection;
        this.selectionChange.emit(newSelection);
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
    let hasSelection = this.hasSelection;

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
    let displayIndicesArr = Array.from(this.displayIndices.keys());

    if (!this.pagingDisabled) {
      displayIndicesArr = displayIndicesArr.slice(this.pageInfo.minIndex, this.pageInfo.maxIndex);
    }
    
    this.rows.forEach((row, i) => {    
      let rowDisplayIdx = this.displayIndices ? this.displayIndices.get(i) : i;
      let pagedIndex = rowDisplayIdx != null ? displayIndicesArr.findIndex(di => di == i) : -1;
      let paged = pagedIndex !== -1 && (this.pagingDisabled || this.pageInfo.inRange(rowDisplayIdx));

      row.paged = paged;

      // if (!paged) {
      //   row.templateContext = null;
      // }
      // else {
        row.templateContext.index = pagedIndex;
        row.templateContext.count = displayIndicesArr.length;
      // }
    })

    this.cd.detectChanges();
  }

  protected gotoIndex(displayIndex: number) {
      this.page = this.getPageForIndex(displayIndex);
      this.buildPageInfo();
      this.pageChange.emit(this.page);
  }

  toggleRowsSelection(row: Row) {
    if (!this.selectable) {
      return ;
    }

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

  protected get pagingDisabled() {
    return this.pageInfo.disabled;
  }

  get hasSelection(): boolean {
      return this.selection != null && this.selection.length > 0
  }
  
  get pageCount() {
    return this._pageCount;
  }


}