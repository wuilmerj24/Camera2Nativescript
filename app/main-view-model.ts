import { Observable } from '@nativescript/core';

export class HelloWorldModel extends Observable {
    private _counter: number;
    private _message: string;

    constructor() {
        super();
    }
}
