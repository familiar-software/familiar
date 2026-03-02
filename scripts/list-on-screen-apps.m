#import <Foundation/Foundation.h>
#import <AppKit/AppKit.h>
#import <CoreGraphics/CoreGraphics.h>

static NSInteger IntValue(id value) {
    return [value respondsToSelector:@selector(integerValue)] ? [value integerValue] : 0;
}

static CGFloat DoubleValue(id value) {
    return [value respondsToSelector:@selector(doubleValue)] ? [value doubleValue] : 0.0;
}

static NSString *StringValue(id value) {
    return [value isKindOfClass:[NSString class]] ? (NSString *)value : nil;
}

static BOOL BoolValue(id value) {
    return [value respondsToSelector:@selector(boolValue)] ? [value boolValue] : NO;
}

static BOOL IsSystemBundleId(NSString *bundleId) {
    if (!bundleId.length) {
        return NO;
    }

    static NSArray<NSString *> *bundles;
    static dispatch_once_t once;
    dispatch_once(&once, ^{
        bundles = @[
            @"com.apple.dock",
            @"com.apple.controlcenter",
            @"com.apple.Spotlight",
            @"com.apple.TextInputMenuAgent",
            @"com.apple.WindowServer"
        ];
    });

    return [bundles containsObject:bundleId];
}

static BOOL IsSystemWindowName(NSString *windowName) {
    if (!windowName.length) {
        return NO;
    }

    static NSArray<NSString *> *names;
    static dispatch_once_t once;
    dispatch_once(&once, ^{
        names = @[
            @"Window Server",
            @"Window Server \"Menubar\"",
            @"Control Center",
            @"Spotlight",
            @"TextInputMenuAgent",
        ];
    });

    return [names containsObject:windowName];
}

static BOOL IsWindowLikelyUserVisible(NSInteger layer, CGFloat alpha, NSRunningApplication *app, NSString *name) {
    if (alpha <= 0.0) {
        return NO;
    }

    if (layer != 0) {
        return NO;
    }

    if (app && app.activationPolicy != NSApplicationActivationPolicyRegular) {
        return NO;
    }

    return YES;
}

static CGFloat RectangleArea(CGRect value) {
    if (CGRectIsNull(value)) {
        return 0.0;
    }
    return fmax(0.0, value.size.width * value.size.height);
}

static NSArray<NSDictionary *> *CollectScreenInfo(void) {
    NSMutableArray<NSDictionary *> *screenInfo = [NSMutableArray array];

    uint32_t displayCount = 0;
    CGError listError = CGGetActiveDisplayList(0, NULL, &displayCount);
    if (listError == kCGErrorSuccess && displayCount > 0) {
        CGDirectDisplayID *displays = calloc((size_t)displayCount, sizeof(CGDirectDisplayID));
        if (displays) {
            listError = CGGetActiveDisplayList(displayCount, displays, &displayCount);
            if (listError == kCGErrorSuccess) {
                for (uint32_t i = 0; i < displayCount; i++) {
                    CGDirectDisplayID displayId = displays[i];
                    CGRect frame = CGDisplayBounds(displayId);
                    if (CGRectIsNull(frame) || frame.size.width <= 0 || frame.size.height <= 0) {
                        continue;
                    }
                    [screenInfo addObject:@{
                        @"index": @(i),
                        @"displayId": @(displayId),
                        @"frame": [NSValue valueWithRect:frame]
                    }];
                }
            }
            free(displays);
        }
    }

    if (screenInfo.count > 0) {
        return screenInfo;
    }

    NSArray<NSScreen *> *screens = [NSScreen screens];
    NSInteger screenIndex = 0;
    for (NSScreen *screen in screens) {
        NSNumber *displayId = screen.deviceDescription[@"NSScreenNumber"];
        CGRect frame = screen.frame;
        if (CGRectIsNull(frame) || frame.size.width <= 0 || frame.size.height <= 0 || ![displayId isKindOfClass:[NSNumber class]]) {
            continue;
        }

        [screenInfo addObject:@{
            @"index": @(screenIndex),
            @"displayId": displayId,
            @"frame": [NSValue valueWithRect:frame]
        }];
        screenIndex += 1;
    }

    return screenInfo;
}

static CGRect CGRectFromDictionary(NSDictionary *dict) {
    NSDictionary *bounds = [dict isKindOfClass:[NSDictionary class]] ? dict : nil;
    if (!bounds) {
        return CGRectNull;
    }

    NSNumber *x = bounds[@"X"];
    NSNumber *y = bounds[@"Y"];
    NSNumber *width = bounds[@"Width"];
    NSNumber *height = bounds[@"Height"];

    if (![x isKindOfClass:[NSNumber class]] ||
        ![y isKindOfClass:[NSNumber class]] ||
        ![width isKindOfClass:[NSNumber class]] ||
        ![height isKindOfClass:[NSNumber class]]) {
        return CGRectNull;
    }

    return CGRectMake([x doubleValue], [y doubleValue], [width doubleValue], [height doubleValue]);
}

static NSArray<NSValue *> *SubtractRectsByBlocker(NSArray<NSValue *> *rects, CGRect blocker) {
    if (CGRectIsNull(blocker)) {
        return rects;
    }

    NSMutableArray<NSValue *> *result = [NSMutableArray array];
    for (NSValue *value in rects) {
        CGRect rect = [value rectValue];
        CGRect intersection = CGRectIntersection(rect, blocker);
        if (CGRectIsNull(intersection)) {
            [result addObject:value];
            continue;
        }

        CGFloat left = CGRectGetMinX(rect);
        CGFloat right = CGRectGetMaxX(rect);
        CGFloat bottom = CGRectGetMinY(rect);
        CGFloat top = CGRectGetMaxY(rect);
        CGFloat blockerLeft = CGRectGetMinX(intersection);
        CGFloat blockerRight = CGRectGetMaxX(intersection);
        CGFloat blockerBottom = CGRectGetMinY(intersection);
        CGFloat blockerTop = CGRectGetMaxY(intersection);

        CGRect pieces[] = {
            CGRectMake(left, bottom, rect.size.width, blockerBottom - bottom),
            CGRectMake(left, blockerTop, rect.size.width, top - blockerTop),
            CGRectMake(left, fmax(bottom, blockerBottom), blockerLeft - left, fmin(top, blockerTop) - fmax(bottom, blockerBottom)),
            CGRectMake(blockerRight, fmax(bottom, blockerBottom), right - blockerRight, fmin(top, blockerTop) - fmax(bottom, blockerBottom))
        };

        for (NSUInteger i = 0; i < 4; i++) {
            CGRect piece = pieces[i];
            if (piece.size.width > 0 && piece.size.height > 0) {
                [result addObject:[NSValue valueWithRect:piece]];
            }
        }
    }

    return result;
}

static CGFloat VisibleArea(CGRect bounds, NSArray<NSValue *> *occluders, NSArray<NSDictionary *> *screenInfo, BOOL hasScreenInfo) {
    NSArray<NSValue *> *visiblePieces = @[ [NSValue valueWithRect:bounds] ];

    for (NSValue *occluder in occluders) {
        visiblePieces = SubtractRectsByBlocker(visiblePieces, [occluder rectValue]);
        if (visiblePieces.count == 0) {
            return 0;
        }
    }

    CGFloat visibleArea = 0.0;
    if (!hasScreenInfo) {
        for (NSValue *piece in visiblePieces) {
            visibleArea += RectangleArea([piece rectValue]);
        }
        return visibleArea;
    }

    for (NSValue *piece in visiblePieces) {
        CGRect pieceRect = [piece rectValue];
        for (NSDictionary *screen in screenInfo) {
            CGRect intersection = CGRectIntersection(pieceRect, [screen[@"frame"] rectValue]);
            visibleArea += RectangleArea(intersection);
        }
    }

    return visibleArea;
}

static NSString *UsageText(void) {
    return @"Usage: list-on-screen-apps-helper [options]\n"
           "Options:\n"
           "  --json                 Output JSON payload (default)\n"
           "  --min-visible-area N    Minimum visible area in default mode (default: 20000)\n"
           "  --help                 Show this help text\n";
}

int main(int argc, const char * argv[]) {
    @autoreleasepool {
        CGFloat minVisibleArea = 20000.0;

        for (NSInteger i = 1; i < argc; i++) {
            NSString *arg = [NSString stringWithUTF8String:argv[i]];
            if ([arg isEqualToString:@"--help"] || [arg isEqualToString:@"-h"]) {
                printf("%s\n", [UsageText() UTF8String]);
                return 0;
            }

            if ([arg isEqualToString:@"--min-visible-area"]) {
                if (i + 1 >= argc) {
                    fprintf(stderr, "Missing value for --min-visible-area\n");
                    return 1;
                }
                minVisibleArea = [[NSString stringWithUTF8String:argv[i + 1]] doubleValue];
                i += 1;
                continue;
            }
        }

        if (minVisibleArea < 0.0) {
            minVisibleArea = 0.0;
        }

        CFArrayRef rawWindowInfo = CGWindowListCopyWindowInfo(
            kCGWindowListOptionOnScreenOnly | kCGWindowListExcludeDesktopElements,
            kCGNullWindowID
        );
        if (!rawWindowInfo) {
            printf("[]\n");
            return 0;
        }

        NSArray<NSDictionary *> *windowInfo = (__bridge_transfer NSArray<NSDictionary *> *)rawWindowInfo;
        NSArray<NSDictionary *> *screenInfo = CollectScreenInfo();
        BOOL hasScreenInfo = screenInfo.count > 0;

        NSMutableArray<NSDictionary *> *candidates = [NSMutableArray array];
        NSInteger index = 0;

        for (NSDictionary *rawWindow in windowInfo) {
            if (!BoolValue(rawWindow[(__bridge NSString *)kCGWindowIsOnscreen])) {
                index += 1;
                continue;
            }

            NSInteger pid = IntValue(rawWindow[(__bridge NSString *)kCGWindowOwnerPID]);
            CGRect bounds = CGRectFromDictionary(rawWindow[(__bridge NSString *)kCGWindowBounds]);
            if (pid <= 0 || CGRectIsNull(bounds) || bounds.size.width <= 0 || bounds.size.height <= 0) {
                index += 1;
                continue;
            }

            BOOL intersectsScreen = (screenInfo.count == 0);
            if (screenInfo.count > 0) {
                for (NSDictionary *screen in screenInfo) {
                    CGRect screenFrame = [screen[@"frame"] rectValue];
                    if (!CGRectIsNull(CGRectIntersection(bounds, screenFrame))) {
                        intersectsScreen = YES;
                        break;
                    }
                }
                if (!intersectsScreen) {
                    index += 1;
                    continue;
                }
            }

            NSRunningApplication *app = [NSRunningApplication runningApplicationWithProcessIdentifier:pid];
            NSString *ownerName = StringValue(rawWindow[(__bridge NSString *)kCGWindowOwnerName]);
            NSString *name = ownerName.length ? ownerName : app.localizedName;
            if (!name.length) {
                index += 1;
                continue;
            }

            NSInteger layer = IntValue(rawWindow[(__bridge NSString *)kCGWindowLayer]);
            CGFloat alpha = DoubleValue(rawWindow[(__bridge NSString *)kCGWindowAlpha]);
            NSString *bundleId = app.bundleIdentifier;

            if (!IsWindowLikelyUserVisible(layer, alpha, app, name)) {
                index += 1;
                continue;
            }

            if (IsSystemBundleId(bundleId) || IsSystemWindowName(name)) {
                index += 1;
                continue;
            }

            CGFloat totalArea = bounds.size.width * bounds.size.height;
            if (totalArea < minVisibleArea) {
                index += 1;
                continue;
            }

            NSInteger windowId = IntValue(rawWindow[(__bridge NSString *)kCGWindowNumber]);
            if (windowId == 0) {
                windowId = index;
            }

            NSString *title = StringValue(rawWindow[(__bridge NSString *)kCGWindowName]);

            NSMutableDictionary<NSString *, id> *candidate = [@{
                @"windowId": @(windowId),
                @"pid": @(pid),
                @"name": name,
                @"active": @(app.isActive),
                @"bounds": @{
                    @"x": @(bounds.origin.x),
                    @"y": @(bounds.origin.y),
                    @"width": @(bounds.size.width),
                    @"height": @(bounds.size.height)
                },
                @"totalArea": @(llround(totalArea)),
                @"visibleArea": @(llround(totalArea)),
                @"layer": @(layer),
                @"alpha": @(alpha),
                @"index": @(index)
            } mutableCopy];

            if (bundleId.length > 0) {
                candidate[@"bundleId"] = bundleId;
            }
            if (title.length > 0) {
                candidate[@"title"] = title;
            }

            [candidates addObject:candidate];
            index += 1;
        }

        [candidates sortUsingComparator:^NSComparisonResult(NSDictionary *left, NSDictionary *right) {
            NSInteger leftLayer = [left[@"layer"] integerValue];
            NSInteger rightLayer = [right[@"layer"] integerValue];
            if (leftLayer == rightLayer) {
                NSInteger leftIndex = [left[@"index"] integerValue];
                NSInteger rightIndex = [right[@"index"] integerValue];
                return leftIndex < rightIndex ? NSOrderedAscending : NSOrderedDescending;
            }
            return leftLayer > rightLayer ? NSOrderedAscending : NSOrderedDescending;
        }];

        NSMutableArray<NSValue *> *occluders = [NSMutableArray array];
        NSMutableArray<NSDictionary *> *output = [NSMutableArray array];

        for (NSDictionary *window in candidates) {
            CGRect bounds = CGRectMake(
                [window[@"bounds"][@"x"] doubleValue],
                [window[@"bounds"][@"y"] doubleValue],
                [window[@"bounds"][@"width"] doubleValue],
                [window[@"bounds"][@"height"] doubleValue]
            );

            CGFloat visibleArea = VisibleArea(bounds, occluders, screenInfo, hasScreenInfo);
            if (visibleArea < minVisibleArea) {
                continue;
            }

            CGFloat totalArea = [window[@"totalArea"] doubleValue];
            NSMutableDictionary<NSString *, id> *item = [window mutableCopy];
            item[@"visibleArea"] = @(llround(visibleArea));
            item[@"visibleAreaRatio"] = totalArea > 0 ? @(visibleArea / totalArea) : @0;
            [item removeObjectForKey:@"layer"];
            [item removeObjectForKey:@"alpha"];
            [item removeObjectForKey:@"index"];
            [output addObject:item];

            if ([window[@"alpha"] doubleValue] > 0.0 && totalArea > 0) {
                if (hasScreenInfo) {
                    for (NSDictionary *screen in screenInfo) {
                        CGRect intersection = CGRectIntersection(bounds, [screen[@"frame"] rectValue]);
                        if (!CGRectIsNull(intersection) && intersection.size.width > 0 && intersection.size.height > 0) {
                            [occluders addObject:[NSValue valueWithRect:intersection]];
                        }
                    }
                } else {
                    [occluders addObject:[NSValue valueWithRect:bounds]];
                }
            }
        }

        [output sortUsingComparator:^NSComparisonResult(NSDictionary *left, NSDictionary *right) {
            NSInteger leftVisible = [left[@"visibleArea"] integerValue];
            NSInteger rightVisible = [right[@"visibleArea"] integerValue];
            if (leftVisible == rightVisible) {
                NSInteger leftWindowId = [left[@"windowId"] integerValue];
                NSInteger rightWindowId = [right[@"windowId"] integerValue];
                return leftWindowId < rightWindowId ? NSOrderedAscending : NSOrderedDescending;
            }
            return leftVisible > rightVisible ? NSOrderedAscending : NSOrderedDescending;
        }];

        NSError *jsonError = nil;
        NSData *data = [NSJSONSerialization dataWithJSONObject:output options:NSJSONWritingPrettyPrinted error:&jsonError];
        if (!data) {
            fprintf(stderr, "%s\n", [[jsonError localizedDescription] UTF8String]);
            printf("[]\n");
            return 1;
        }

        fwrite([data bytes], 1, [data length], stdout);
        fputc('\n', stdout);
    }

    return 0;
}
