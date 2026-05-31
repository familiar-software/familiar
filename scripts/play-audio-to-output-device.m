#import <AudioToolbox/AudioToolbox.h>
#import <AVFoundation/AVFoundation.h>
#import <Foundation/Foundation.h>

static BOOL deviceHasOutputChannels(AudioDeviceID deviceID) {
  AudioObjectPropertyAddress address = {
    kAudioDevicePropertyStreamConfiguration,
    kAudioDevicePropertyScopeOutput,
    kAudioObjectPropertyElementMain
  };
  UInt32 size = 0;
  OSStatus status = AudioObjectGetPropertyDataSize(deviceID, &address, 0, NULL, &size);
  if (status != noErr || size == 0) {
    return NO;
  }

  AudioBufferList *bufferList = malloc(size);
  if (bufferList == NULL) {
    return NO;
  }

  status = AudioObjectGetPropertyData(deviceID, &address, 0, NULL, &size, bufferList);
  if (status != noErr) {
    free(bufferList);
    return NO;
  }

  UInt32 channels = 0;
  for (UInt32 i = 0; i < bufferList->mNumberBuffers; i++) {
    channels += bufferList->mBuffers[i].mNumberChannels;
  }
  free(bufferList);
  return channels > 0;
}

static NSString *deviceName(AudioDeviceID deviceID) {
  AudioObjectPropertyAddress address = {
    kAudioDevicePropertyDeviceNameCFString,
    kAudioObjectPropertyScopeGlobal,
    kAudioObjectPropertyElementMain
  };
  CFStringRef name = NULL;
  UInt32 size = sizeof(name);
  OSStatus status = AudioObjectGetPropertyData(deviceID, &address, 0, NULL, &size, &name);
  if (status != noErr || name == NULL) {
    return @"";
  }
  return CFBridgingRelease(name);
}

static AudioDeviceID findOutputDevice(NSString *requestedName) {
  AudioObjectPropertyAddress address = {
    kAudioHardwarePropertyDevices,
    kAudioObjectPropertyScopeGlobal,
    kAudioObjectPropertyElementMain
  };
  UInt32 size = 0;
  OSStatus status = AudioObjectGetPropertyDataSize(
      kAudioObjectSystemObject, &address, 0, NULL, &size);
  if (status != noErr || size == 0) {
    return 0;
  }

  UInt32 count = size / sizeof(AudioDeviceID);
  AudioDeviceID *devices = calloc(count, sizeof(AudioDeviceID));
  if (devices == NULL) {
    return 0;
  }

  status = AudioObjectGetPropertyData(kAudioObjectSystemObject, &address, 0, NULL, &size, devices);
  if (status != noErr) {
    free(devices);
    return 0;
  }

  AudioDeviceID result = 0;
  for (UInt32 i = 0; i < count; i++) {
    NSString *name = deviceName(devices[i]);
    if (deviceHasOutputChannels(devices[i]) && [name isEqualToString:requestedName]) {
      result = devices[i];
      break;
    }
  }
  free(devices);
  return result;
}

int main(int argc, const char *argv[]) {
  @autoreleasepool {
    if (argc != 3) {
      fprintf(stderr, "Usage: play-audio-to-output-device <audio-file> <device-name>\n");
      return 64;
    }

    NSString *audioPath = [NSString stringWithUTF8String:argv[1]];
    NSString *device = [NSString stringWithUTF8String:argv[2]];
    AudioDeviceID deviceID = findOutputDevice(device);
    if (deviceID == 0) {
      fprintf(stderr, "Output audio device not found: %s\n", argv[2]);
      return 66;
    }

    NSError *error = nil;
    NSURL *audioURL = [NSURL fileURLWithPath:audioPath];
    AVAudioFile *file = [[AVAudioFile alloc] initForReading:audioURL error:&error];
    if (file == nil) {
      fprintf(stderr, "Failed to open audio file: %s\n", error.localizedDescription.UTF8String);
      return 65;
    }

    AVAudioEngine *engine = [[AVAudioEngine alloc] init];
    AVAudioPlayerNode *player = [[AVAudioPlayerNode alloc] init];
    [engine attachNode:player];
    [engine connect:player to:engine.mainMixerNode format:file.processingFormat];

    AudioUnit audioUnit = engine.outputNode.audioUnit;
    OSStatus status = AudioUnitSetProperty(
        audioUnit,
        kAudioOutputUnitProperty_CurrentDevice,
        kAudioUnitScope_Global,
        0,
        &deviceID,
        sizeof(deviceID));
    if (status != noErr) {
      fprintf(stderr, "Failed to set output device: %d\n", status);
      return 70;
    }

    dispatch_semaphore_t done = dispatch_semaphore_create(0);
    [player scheduleFile:file atTime:nil completionHandler:^{
      dispatch_semaphore_signal(done);
    }];

    if (![engine startAndReturnError:&error]) {
      fprintf(stderr, "Failed to start audio engine: %s\n", error.localizedDescription.UTF8String);
      return 70;
    }

    [player play];
    dispatch_semaphore_wait(done, DISPATCH_TIME_FOREVER);
    [player stop];
    [engine stop];
    return 0;
  }
}
