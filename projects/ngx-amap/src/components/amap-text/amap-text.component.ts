import {
  Component,
  Input,
  OnDestroy,
  Output,
  EventEmitter,
  SimpleChanges,
  OnChanges,
  ContentChildren,
  QueryList,
  AfterContentInit,
  ElementRef,
  NgZone,
} from '@angular/core';
import { zip, Subscription } from 'rxjs';
import { AmapTextService } from './amap-text.service';
import { LoggerService } from '../../shared/logger/logger.service';
import { AMapOverlay, OverlayOptions } from '../../base/amap-overlay';
import { EventBinderService } from '../../shared/event-binder.service';
import { getOptions, ChangeFilter } from '../../utils';
import { IPixel, IIcon } from '../../interfaces';
import { PixelService } from '../../shared/pixel.service';
import { IconService } from '../../shared/icon.service';
import { AmapInfoWindowComponent } from '../amap-info-window/amap-info-window.component';
import { AMapService } from '../../shared/amap.service';

const TAG = 'amap-text';
const ALL_OPTIONS = [
  ...OverlayOptions,
  'text',
  'position',
  'anchor',
  'offset',
  'topWhenClick',
  'raiseOnDrag',
  'visible',
  'zIndex',
  'angle',
  'autoRotation',
  'animation',
  'shadow',
  'title',
  'style',
];

@Component({
  selector: 'amap-text',
  exportAs: 'text',
  templateUrl: './amap-text.component.html',
  providers: [AmapTextService],
})
export class AmapTextComponent extends AMapOverlay<AMap.Text>
  implements OnChanges, OnDestroy, AfterContentInit {
  // ---- Options ----
  /**
   * 点标记显示内容
   */
  @Input() text: string;
  /**
   * 点标记在地图上显示的位置
   */
  @Input() position: AMap.LocationValue;
  /**
   * 标记锚点
   */
  @Input() anchor: AMap.Marker.Anchor;
  /**
   * 点标记显示位置偏移量
   */
  @Input() offset: AMap.Pixel | IPixel;
  /**
   * 鼠标点击时marker是否置顶
   */
  @Input() topWhenClick: boolean;
  /**
   * 拖拽点标记时是否开启点标记离开地图的效果
   */
  @Input() raiseOnDrag: boolean;
  /**
   * 点标记是否可见
   */
  @Input() visible: boolean;
  /**
   * 点标记的叠加顺序
   */
  @Input() zIndex: number;
  /**
   * 点标记的旋转角度
   */
  @Input() angle: number;
  /**
   * 是否自动旋转
   */
  @Input() autoRotation: boolean;
  /**
   * 点标记的动画效果
   */
  @Input() animation: AMap.AnimationName;
  /**
   * 点标记阴影
   */
  @Input() shadow: AMap.Icon | string | IIcon;
  /**
   * 鼠标滑过点标记时的文字提示
   */
  @Input() title: string;
  /**
   * 样式
   */
  @Input() style: { [key: string]: string };
  /**
   * 额外: 是否置顶
   */
  @Input() isTop: boolean;
  /**
   * 额外: 是否隐藏
   */
  @Input() hidden = false;
  /**
   * 额外: 是否包含在点聚合中
   */
  @Input() inCluster = false;
  /**
   * 额外: 点击时是否显示信息窗体
   */
  @Input() openInfoWindow = true;

  // ---- Events ----
  @Output() naReady = new EventEmitter();
  @Output() naMouseOut: EventEmitter<any>;
  @Output() naDragStart: EventEmitter<any>;
  @Output() naDragging: EventEmitter<any>;
  @Output() naDragEnd: EventEmitter<any>;
  @Output() naMoving: EventEmitter<any>;
  @Output() naMoveEnd: EventEmitter<any>;
  @Output() naMoveAlong: EventEmitter<any>;

  // amap info window:
  @ContentChildren(AmapInfoWindowComponent)
  infoWindowComponent = new QueryList<AmapInfoWindowComponent>();

  private inited = false;
  private subscription: Subscription;

  constructor(
    protected os: AmapTextService,
    protected binder: EventBinderService,
    private amaps: AMapService,
    private el: ElementRef,
    private pixels: PixelService,
    private icons: IconService,
    private logger: LoggerService,
    private ngZone: NgZone,
  ) {
    super(os, binder);
    const target = this.os.get();
    this.naMouseOut = this.binder.bindEvent(target, 'mouseout');
    this.naDragStart = this.binder.bindEvent(target, 'dragstart');
    this.naDragging = this.binder.bindEvent(target, 'dragging');
    this.naDragEnd = this.binder.bindEvent(target, 'dragend');
    this.naMoving = this.binder.bindEvent(target, 'moving');
    this.naMoveEnd = this.binder.bindEvent(target, 'moveend');
    this.naMoveAlong = this.binder.bindEvent(target, 'movealong');
  }

  ngOnDestroy() {
    if (this.subscription) {
      this.subscription.unsubscribe();
    }
    this.os.destroy();
  }

  ngOnChanges(changes: SimpleChanges) {
    const filter = ChangeFilter.of(changes);
    const marker = this.get();
    if (!this.inited) {
      // do not draw text marker when no poistion defined.
      if (!this.position) {
        return;
      }
      this.amaps.get().subscribe(() => {
        this.logger.d(TAG, 'initializing ...');
        // bind info window events:
        this.subscription = this.binder.bindEvent(marker, 'click').subscribe(() => {
          if (this.openInfoWindow) {
            this.infoWindowComponent.forEach(w => w.open());
          }
        });
        const el: HTMLElement = this.el.nativeElement.querySelector('.amap-text-content');
        this.text = this.text ? this.text : el.innerText;
        const options = getOptions<AMap.Text.Options>(this, ALL_OPTIONS);
        if (this.shadow) {
          options.shadow = this.icons.create(this.shadow);
        }
        if (this.offset) {
          options.offset = this.pixels.create(this.offset);
        }
        this.logger.d(TAG, 'options:', options);
        this.os.create(options).subscribe(m => {
          this.ngZone.run(() => this.naReady.emit(m));
          this.logger.d(TAG, 'marker is ready.');
        });
        this.inited = true;
        this.updateInfoWindow();
        this.updateInfoWindowPosition();
      });
    } else {
      zip(filter.has<string | AMap.Icon>('shadow'), marker).subscribe(([v, m]) =>
        m.setShadow(this.icons.create(v)),
      );
      zip(filter.has<AMap.Pixel | IPixel>('offset'), marker).subscribe(([v, m]) =>
        m.setOffset(this.pixels.create(v)),
      );
      zip(filter.has<string>('title'), marker).subscribe(([v, m]) => m.setTitle(v));
      zip(filter.has<any>('content'), marker).subscribe(([v, m]) => m.setContent(v));
      zip(filter.has<any>('extData'), marker).subscribe(([v, m]) => m.setExtData(v));
      zip(filter.has<boolean>('clickable'), marker).subscribe(([v, m]) => m.setClickable(!!v));
      zip(filter.has<boolean>('draggable'), marker).subscribe(([v, m]) => m.setDraggable(!!v));
      zip(filter.has<boolean>('visible'), marker).subscribe(([v, m]) => (v ? m.show() : m.hide()));
      zip(filter.has<string>('cursor'), marker).subscribe(([v, m]) => m.setCursor(v));
      zip(filter.has<AMap.AnimationName>('animation'), marker).subscribe(([v, m]) =>
        m.setAnimation(v),
      );
      zip(filter.has<number>('angle'), marker).subscribe(([v, m]) => m.setAngle(v));
      zip(filter.has<number>('zIndex'), marker).subscribe(([v, m]) => m.setzIndex(v));
      zip(filter.notEmpty<AMap.LocationValue>('position'), marker).subscribe(([v, m]) =>
        m.setPosition(v),
      );
      zip(filter.notEmpty<any>('style'), marker).subscribe(([v, m]) => m.setStyle(v));
    }
    zip(filter.has<boolean>('isTop'), marker).subscribe(([v, m]) => m.setTop(!!v));
    zip(filter.has<boolean>('hidden'), marker).subscribe(([v, m]) => (v ? m.hide() : m.show()));
  }

  ngAfterContentInit() {
    this.updateInfoWindow();
    this.infoWindowComponent.changes.subscribe(() => this.updateInfoWindow());
  }

  private updateInfoWindow() {
    if (this.infoWindowComponent && this.inited) {
      if (this.infoWindowComponent.length > 1) {
        this.logger.e(TAG, 'Expected no more than 1 info window.');
        return;
      }

      const marker = this.os.get();
      this.infoWindowComponent.forEach(component => {
        component.hostMarker = marker;
      });
    }
  }

  private updateInfoWindowPosition() {
    if (this.infoWindowComponent && this.inited) {
      this.infoWindowComponent.forEach(component => {
        component.toggleOpen();
      });
    }
  }

  /**
   * 获取已创建的 AMap.Text 对象
   */
  get() {
    return this.os.get();
  }
}
