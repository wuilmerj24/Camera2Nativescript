import { Application, Color, CreateViewEventData, EventData, GridLayout, isAndroid, isIOS, Page, Placeholder, View } from '@nativescript/core';
import { HelloWorldModel } from './main-view-model';
import { android as androidApp, AndroidApplication,ApplicationEventData } from "@nativescript/core/application";
const permissions = require("nativescript-permissions");
var page;
import * as applicationModule from "@nativescript/core/application";
import * as utilsModule from "@nativescript/core/utils";
import { fromObject } from "@nativescript/core";

// for iOS output
var output;

if (isAndroid) {
    var mCameraId;
    var mCaptureSession;
    var mCameraDevice;
    var mStateCallBack;
    var mBackgroundHandler = null;
    var mCameraOpenCloseLock = new java.util.concurrent.Semaphore(1);
    var mTextureView;
    var mSurfaceTexture;
    var mPreviewRequestBuilder;
    var mPreviewRequest;
    var mImageReader;
    var mCaptureCallback;
    var mFlashSupported;
    var mFile;
}

var STATE_PREVIEW = 0;
var STATE_WAITING_LOCK = 1;
var STATE_WAITING_PRECAPTURE = 2;
var STATE_WAITING_NON_PRECAPTURE = 3;
var STATE_PICTURE_TAKEN = 4;
var mState = STATE_PREVIEW;
var appContext = utilsModule.ad.getApplicationContext();

export function navigatingTo(args: EventData) {
    page = <Page>args.object;
    // page.bindingContext = new HelloWorldModel();
    // permissions.requestPermission(android.Manifest.permission.CAMERA, "I need these permissions because I'm cool").then(() => {
    //     alert("Woo Hoo, I have the power!");    
    // }).catch(() => {
    //     alert("Uh oh, no permissions - plan B time!");
    // });
    applicationModule.on(applicationModule.suspendEvent,(args:ApplicationEventData)=>{
        
    });

    applicationModule.on(applicationModule.resumeEvent,(args:ApplicationEventData)=>{
        
    });

    applicationModule.on(applicationModule.lowMemoryEvent, (args: ApplicationEventData) =>{
        console.log("low memory")
    });
}

function createCameraPreviewSession() {
    console.log("createCameraPreviewSession ");

    if (!mSurfaceTexture || !mCameraDevice) {
        return;
    }

    var texture = mTextureView.getSurfaceTexture();

    // We configure the size of default buffer to be the size of camera preview we want.
    texture.setDefaultBufferSize(800, 480);

    // This is the output Surface we need to start preview.
    var surface = new android.view.Surface(texture);

    // // We set up a CaptureRequest.Builder with the output Surface.
    mPreviewRequestBuilder = mCameraDevice.createCaptureRequest(android.hardware.camera2.CameraDevice.TEMPLATE_PREVIEW);
    mPreviewRequestBuilder.addTarget(surface);

    var surfaceList = new java.util.ArrayList();
    surfaceList.add(surface);
    mCameraDevice.createCaptureSession(surfaceList, new MyCameraCaptureSessionStateCallback(appContext), null);
}

export async function onCreatingView(args) {
    mStateCallBack = new MyStateCallback(appContext);
    var cameraManager:android.hardware.camera2.CameraManager = appContext.getSystemService(android.content.Context.CAMERA_SERVICE);
    var cameras = cameraManager.getCameraIdList();
    for (var index = 0; index < cameras.length; index++) {
        var currentCamera = cameras[index];
        var currentCameraSpecs = cameraManager.getCameraCharacteristics(currentCamera);
        var available = currentCameraSpecs.get(android.hardware.camera2.CameraCharacteristics.FLASH_INFO_AVAILABLE);
        mFlashSupported = available == null ? false : true;

        // get available lenses and set the camera-type (front or back)
        var facing = currentCameraSpecs.get(android.hardware.camera2.CameraCharacteristics.LENS_FACING);

        if (facing !== null && facing == android.hardware.camera2.CameraCharacteristics.LENS_FACING_BACK) {
            console.log("BACK camera");
            mCameraId = currentCamera;
        }

        // get all available sizes ad set the format
        var map = currentCameraSpecs.get(android.hardware.camera2.CameraCharacteristics.SCALER_STREAM_CONFIGURATION_MAP);
        var format = map.getOutputSizes(android.graphics.ImageFormat.JPEG);
        // console.log("Format: " + format + " " + format.length + " " + format[4]);

        // we are taking not the largest possible but some of the 5th in the list of resolutions
        if (format && format !== null) {
            var dimensions = format[0].toString().split('x');
            var largestWidth = +dimensions[0];
            var largestHeight = +dimensions[1];

            // set the output image characteristics
            mImageReader = android.media.ImageReader.newInstance(largestWidth, largestHeight, android.graphics.ImageFormat.JPEG, /*maxImages*/2);
            mImageReader.setOnImageAvailableListener(mOnImageAvailableListener, mBackgroundHandler);
        }
    }

    try {
        cameraManager.openCamera(mCameraId, mStateCallBack, mBackgroundHandler)
    } catch (error) {
        console.log(error)
    }
    //API 23 runtime permission check
    // android.os.Build.VERSION.SDK_INT < android.os.Build.VERSION_CODES.LOLLIPOP
    //     ? await new android.hardware.camera2.CameraManager().openCamera(mCameraId, mStateCallBack, mBackgroundHandler)
    //     : permissions
    //         .requestPermission(
    //             android.Manifest.permission.CAMERA,
    //             "I need these permissions to use Android Camera"
    //         )
    //         .then(async () =>{
    //             await new android.hardware.camera2.CameraManager().openCamera(mCameraId, mStateCallBack, mBackgroundHandler);
    //         })
    //         .catch((err) => {
    //             console.log(err)
    //         });

    mTextureView =new android.view.TextureView(appContext);
    mTextureView.setSurfaceTextureListener(mSurfaceTextureListener);
    args.view = mTextureView;
}


function captureStillPicture() {
    // This is the CaptureRequest.Builder that we use to take a picture.
    var captureBuilder = mCameraDevice.createCaptureRequest(android.hardware.camera2.CameraDevice.TEMPLATE_STILL_CAPTURE);
    captureBuilder.addTarget(mImageReader.getSurface());

    // Use the same AE and AF modes as the preview.
    setAutoFlash(captureBuilder);

    mCaptureSession.stopRepeating();
    mCaptureSession.abortCaptures();
    mCaptureSession.capture(captureBuilder.build(), new CaptureCallback(appContext), null);
}

function setAutoFlash(requestBuilder) {
    console.log("mFlashSupported in setAutoFlash:" + mFlashSupported);
    if (mFlashSupported) {
        requestBuilder.set(android.hardware.camera2.CaptureRequest.CONTROL_AE_MODE,
            android.hardware.camera2.CaptureRequest.CONTROL_AE_MODE_ON_AUTO_FLASH);
    }
}


function runPrecaptureSequence() {
    // This is how to tell the camera to trigger.
    mPreviewRequestBuilder.set(android.hardware.camera2.CaptureRequest.CONTROL_AE_PRECAPTURE_TRIGGER, android.hardware.camera2.CaptureRequest.CONTROL_AE_PRECAPTURE_TRIGGER_START);
    // Tell #mCaptureCallback to wait for the precapture sequence to be set.
    mState = STATE_WAITING_PRECAPTURE;
    mCaptureSession.capture(mPreviewRequestBuilder.build(), new CaptureCallback(appContext), mBackgroundHandler);
}

export class CaptureCallback extends android.hardware.camera2.CameraCaptureSession.CaptureCallback{
    static constructorCalled: boolean = false;
    constructor(context) {
        super();
        CaptureCallback.constructorCalled = true;

        // necessary when extending TypeScript constructors
        return global.__native(context);
    }

    public onCaptureStarted(param0: android.hardware.camera2.CameraCaptureSession, param1: android.hardware.camera2.CaptureRequest, param2: number, param3: number): void {
        throw new Error('Method not implemented.');
    }
    public onCaptureProgressed(param0: android.hardware.camera2.CameraCaptureSession, param1: android.hardware.camera2.CaptureRequest, param2: android.hardware.camera2.CaptureResult): void {
        throw new Error('Method not implemented.');
    }
    public onCaptureFailed(param0: android.hardware.camera2.CameraCaptureSession, param1: android.hardware.camera2.CaptureRequest, param2: android.hardware.camera2.CaptureFailure): void {
        throw new Error('Method not implemented.');
    }
    public onCaptureCompleted(session: android.hardware.camera2.CameraCaptureSession, request: android.hardware.camera2.CaptureRequest, result: android.hardware.camera2.TotalCaptureResult): void {
        console.log("onCaptureCompleted");
    }
    public onCaptureSequenceCompleted(param0: android.hardware.camera2.CameraCaptureSession, param1: number, param2: number): void {
        throw new Error('Method not implemented.');
    }
    public onCaptureSequenceAborted(param0: android.hardware.camera2.CameraCaptureSession, param1: number): void {
        throw new Error('Method not implemented.');
    }

}

export class MyCameraCaptureSessionStateCallback extends android.hardware.camera2.CameraCaptureSession.StateCallback {
    static constructorCalled: boolean = false;
    // constructor
    constructor(context) {
        super();
        MyCameraCaptureSessionStateCallback.constructorCalled = true;
        // necessary when extending TypeScript constructors
        return global.__native(context);
    }

    public onActive(param0: android.hardware.camera2.CameraCaptureSession): void {
        throw new Error('Method not implemented.');
    }
    public onClosed(param0: android.hardware.camera2.CameraCaptureSession): void {
        throw new Error('Method not implemented.');
    }
    public onConfigured(cameraCaptureSession: android.hardware.camera2.CameraCaptureSession): void {
        if (mCameraDevice === null) {
            return;
        }

        mCaptureSession = cameraCaptureSession;

        mPreviewRequestBuilder.set(android.hardware.camera2.CaptureRequest.CONTROL_AF_MODE, android.hardware.camera2.CaptureRequest.CONTROL_AF_MODE_CONTINUOUS_PICTURE);
        // // Flash is automatically enabled when necessary.
        // setAutoFlash(mPreviewRequestBuilder);

        // Finally, we start displaying the camera preview.
        mPreviewRequest = mPreviewRequestBuilder.build();
        mCaptureSession.setRepeatingRequest(mPreviewRequest, new MyCaptureSessionCaptureCallback(appContext), null);
    }
    public onReady(param0: android.hardware.camera2.CameraCaptureSession): void {
        throw new Error('Method not implemented.');
    }
    public onConfigureFailed(cameraCaptureSession: android.hardware.camera2.CameraCaptureSession): void {
        console.log("onConfigureFailed " + cameraCaptureSession);
    }

}


export class MyCaptureSessionCaptureCallback extends android.hardware.camera2.CameraCaptureSession.CaptureCallback{
    static constructorCalled: boolean = false;
    // constructor
    constructor(context) {
        super();
        MyCaptureSessionCaptureCallback.constructorCalled = true;
        // necessary when extending TypeScript constructors
        return global.__native(context);
    }

    public process(result){
        switch (mState) {
            case STATE_PREVIEW: {
                // We have nothing to do when the camera preview is working normally.
                break;
            }
            case STATE_WAITING_LOCK: {
                var afState = result.get(android.hardware.camera2.CaptureResult.CONTROL_AF_STATE);
                if (afState === null) {
                    captureStillPicture();
                } else if (android.hardware.camera2.CaptureResult.CONTROL_AF_STATE_FOCUSED_LOCKED == afState ||
                    android.hardware.camera2.CaptureResult.CONTROL_AF_STATE_NOT_FOCUSED_LOCKED == afState) {
                    // CONTROL_AE_STATE can be null on some devices
                    var aeState = result.get(android.hardware.camera2.CaptureResult.CONTROL_AE_STATE);
                    if (aeState === null ||
                        aeState == android.hardware.camera2.CaptureResult.CONTROL_AE_STATE_CONVERGED) {
                        mState = STATE_PICTURE_TAKEN;
                        captureStillPicture();
                    } else {
                        runPrecaptureSequence();
                    }
                }
                break;
            }
            case STATE_WAITING_PRECAPTURE: {
                // CONTROL_AE_STATE can be null on some devices
                var aeStatee = result.get(android.hardware.camera2.CaptureResult.CONTROL_AE_STATE);
                if (aeStatee === null ||
                    aeStatee == android.hardware.camera2.CaptureResult.CONTROL_AE_STATE_PRECAPTURE ||
                    aeStatee == android.hardware.camera2.CaptureRequest.CONTROL_AE_STATE_FLASH_REQUIRED) {
                    mState = STATE_WAITING_NON_PRECAPTURE;
                }
                break;
            }
            case STATE_WAITING_NON_PRECAPTURE: {
                // CONTROL_AE_STATE can be null on some devices
                var aeStateee = result.get(android.hardware.camera2.CaptureResult.CONTROL_AE_STATE);
                if (aeStateee === null || aeStateee != android.hardware.camera2.CaptureResult.CONTROL_AE_STATE_PRECAPTURE) {
                    mState = STATE_PICTURE_TAKEN;
                    captureStillPicture();
                }
                break;
            }
        }
    }

    public onCaptureStarted(param0: android.hardware.camera2.CameraCaptureSession, param1: android.hardware.camera2.CaptureRequest, param2: number, param3: number): void {
        throw new Error('Method not implemented.');
    }
    public onCaptureProgressed(session: android.hardware.camera2.CameraCaptureSession, request: android.hardware.camera2.CaptureRequest, partialResult: android.hardware.camera2.CaptureResult): void {
        this.process(partialResult);
    }
    public onCaptureFailed(session: android.hardware.camera2.CameraCaptureSession, request: android.hardware.camera2.CaptureRequest, failure: android.hardware.camera2.CaptureFailure): void {
        console.log(failure);
    }
    public onCaptureCompleted(session: android.hardware.camera2.CameraCaptureSession, request: android.hardware.camera2.CaptureRequest, result: android.hardware.camera2.TotalCaptureResult): void {
        this.process(result);
    }
    public onCaptureSequenceCompleted(param0: android.hardware.camera2.CameraCaptureSession, param1: number, param2: number): void {
        throw new Error('Method not implemented.');
    }
    public onCaptureSequenceAborted(param0: android.hardware.camera2.CameraCaptureSession, param1: number): void {
        throw new Error('Method not implemented.');
    }
    
}


export class MyStateCallback extends android.hardware.camera2.CameraDevice.StateCallback{
    constructor(context) {
        super();
        // necessary when extending TypeScript constructors
        return global.__native(context);
    }


    public onDisconnected(cameraDevice: android.hardware.camera2.CameraDevice): void {
        console.log("onDisconnected");
        mCameraOpenCloseLock.release();
        cameraDevice.close();
        mCameraDevice = null;
    }
    public onOpened(cameraDevice: android.hardware.camera2.CameraDevice): void {
        console.log("onOpened " + cameraDevice);
        mCameraOpenCloseLock.release();
        mCameraDevice = cameraDevice;
        // createCameraPreviewSession();
    }
    public onClosed(param0: android.hardware.camera2.CameraDevice): void {
        console.log("onClosed");
    }
    public onError(cameraDevice: android.hardware.camera2.CameraDevice, error: number): void {
        console.log("onError");
        console.log("onError: device = " + cameraDevice);
        console.log("onError: error =  " + error);

        mCameraOpenCloseLock.release();
        cameraDevice.close();
        mCameraDevice = null;
    }

}
// INTERFACE
// (example for: java static interface to javaScript )
// from Java : public static interface    
var mOnImageAvailableListener = new android.media.ImageReader.OnImageAvailableListener({
    onImageAvailable: function (reader) {

        // here we should save our image to file when image is available
        console.log("onImageAvailable");
        console.log(reader);
    }
});


// from Java : public static interface    
var mSurfaceTextureListener = new android.view.TextureView.SurfaceTextureListener({

    onSurfaceTextureAvailable: function (texture, width, height) {
        console.log('onSurfaceTextureAvailable');
        mSurfaceTexture = texture;
        createCameraPreviewSession();
        // openCamera(width, height);
    },

    onSurfaceTextureSizeChanged: function (texture, width, height) {
        console.log('onSurfaceTextureSizeChanged');
        // configureTransform(width, height);
    },

    onSurfaceTextureDestroyed: function (texture) {
        console.log("onSurfaceTextureDestroyed");
        return true;
    },

    onSurfaceTextureUpdated: function (texture) {
        console.log("onSurfaceTexturUpdated");
    },

});