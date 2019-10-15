import { Attribute, Directive, ElementRef, Input, Renderer2, TemplateRef, ViewContainerRef, EmbeddedViewRef, Component, ChangeDetectorRef, OnChanges, QueryList, ViewChildren, SimpleChanges, ChangeDetectionStrategy, TrackByFunction, Output, EventEmitter, ContentChild } from "@angular/core";
import { NgForOfContext } from "@angular/common";

export enum Sort {
  NONE = 0, ASC = 1, DESC = 2
}

export class Row {
  protected _item: any;
  public templateContext = new NgForOfContext(null, null, null, null);

  constructor(
    item: any,
    public actualIndex: number = null,
    public displayIndex: number = null,
    public content: string = null,
    public matched = false,
    public paged = false,
    public selected = false,
    public anchor = false,
  ) {
    this.item = item;
  }

  get item() {
    return this._item;
    return this.templateContext.$implicit;
  }

  set item(value: any) {
    this._item = value;
    this.templateContext.$implicit = value;
  }
}

export class RowModel {
  constructor(
    public rows: Row[] = [],
    public matchedCount = 0
  ) {}

  get length() {
    return this.rows.length;
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
  sortable = true;
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

  protected rowModel = new RowModel();
  protected _pageCount: number;

  protected tasks = {};
  // row index => matched index
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

  /**
   * TODO
   * support columns (
   *   filter by index, prop, exp (content not only text)
   *   filterable
   *   sort by
   *   sortable
   * )
   * columnsConfig
   * customFilters
   * menu
   * disabled flag
   */

  ngOnChanges(changes: SimpleChanges) {
    if (changes.items || changes.filter) {
      this.fullRebuild();
    }
    if (changes.sort) {
      this.prepareStickySelection();
      this.rebuildRows();
  
      // this.schedule('filter', this.renderFiltered);
      this.schedule('sort', this.renderSort);
      this.schedule('page', this.renderPage);
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

  get rows() {
    return this.rowModel.rows;
  }

  protected schedule(type: string, fn: any) {
    if ((type != 'selection' || this.selectable)
        && (type != 'sort' || this.sortable)) {
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
    return this.rowModel.matchedCount;
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
    this._pageCount = this.pagingDisabled
      ? null
      : this.getPageForIndex(this.displayedRowCount);
    this.pageCountChange.emit(this.pageCount);
  }

  protected getPageForIndex(idx: number) {
    return Math.ceil((idx + 1) / this.pageSize);
  }

  protected prepareStickySelection() {
    if (this.stickySelection && !this.pagingDisabled) {
      let pagedRow = this.getPagedRows().filter(r => r.anchor)[0];

      if (pagedRow) {
        this.stickyItem = pagedRow.item;
      }
    }
  }

  protected stickToSelection() {
    if (!this.pagingDisabled) {
      let stickyIndex;

      if (this.stickyItem != null) {
        let predicate = this.elementPredicate(this.stickyItem);
        stickyIndex = this.rowModel.rows.filter(r => predicate(r.item)).map(r => r.displayIndex)[0];
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

  protected fullRebuild() {
    this.prepareStickySelection();
    this.rebuildRows();
    this.updatePageCount();
 
    this.schedule('content', this.readContent);
    this.schedule('filter', this.renderFiltered);
    this.schedule('sort', this.renderSort);
    this.schedule('selection', this.renderSelection);
    this.schedule('page', this.renderPage);
  }
  
  protected rebuildRows() {
    let oldRows = this.rowModel.rows;

    this.rowModel = new RowModel();
    this.rowModel.rows = (this.items || []).map((it, i) => {
      let row: Row;
      let predicate = this.elementPredicate(it);
      let oldRow = oldRows.find(r => predicate(r.item));

      if (oldRow == null) {
        row = new Row(it, i)
      }
      else {
        row = oldRow;
        row.templateContext = new NgForOfContext(it, null, null, null);
        row.actualIndex = i;
        row.item = it;
      }

      return row;
    });
    this.rowModel.matchedCount = this.rowModel.rows.length;
  }  

  protected readContent() {
    this._rowElements.forEach((el, i) => {
      let row = this.rowModel.rows[i];
      row.content = (el.nativeElement as HTMLElement).textContent;
    })
  }


  protected updateRowsDisplayIndex() {
    let count = 0;
    this.rowModel.matchedCount = 0;
    this.rowModel.rows.forEach((row, i) => {
      if (row.matched) {
        row.displayIndex = this.rowModel.matchedCount++;
      }
    })
  }

  protected renderFiltered() {
    let term = this.filter ? this.filter.toLowerCase() : null;

    this.rowModel.rows.forEach((row, i) => {
      row.matched = !term || row.content.toLowerCase().match(term) != null;
    })

    this.updateRowsDisplayIndex();
    this.updatePageCount();
    
    if (this.hasSelection) {
      let newSelection = this.selection.filter(it => {
        let predicate = this.elementPredicate(it);
        return this.rowModel.rows.find(r => {
          return (!this.keepSelection ? r.matched : true) && predicate(r.item);
        }) != null;
      })
      
      if (newSelection.length != this.selection.length) {
        this.selection = newSelection;
        this.selectionChange.emit(newSelection);
      }
    }

    this.cd.detectChanges();
  }
  
  protected renderSort() {
    if (this.sort != Sort.NONE) {
      let weights = [{
        col: {},
        value: 1
      }];

      this.rowModel.rows.sort((rowA, rowB) => {
          let score = 0;

          for (let w of weights) {
              let cellValueA = rowA.content;
              let cellValueB = rowB.content;

              let comparison = cellValueA < cellValueB
                  ? -1
                  : cellValueA > cellValueB
                      ? 1
                      : 0;

              score += w.value * (comparison * (this.sort == Sort.ASC ? 1 : -1))
          }

          return score;
      });

      this.cd.detectChanges();
    }
    this.updateRowsDisplayIndex();
  }

  protected renderSelection() {
    let hasSelection = this.hasSelection;

    this.rowModel.rows.forEach((row, rowIdx) => {
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
    this.stickToSelection();

    let pagedRows = this.getPagedRows();

    this.rowModel.rows.forEach((row, i) => {    
      let pagedIndex = pagedRows.findIndex(r => r == row);
      let paged = pagedIndex != -1;

      row.paged = paged;
      row.templateContext.index = pagedIndex;
      row.templateContext.count = pagedRows.length;
    })

    this.cd.detectChanges();
  }

  protected getPagedRows() {
    return this.rowModel.rows
      .filter(r => r.matched)
      .filter((r, i) => this.pagingDisabled || (i >= this.pageInfo.minIndex && i < this.pageInfo.maxIndex));
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