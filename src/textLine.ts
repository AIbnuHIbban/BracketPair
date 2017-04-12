import * as vscode from "vscode";
import LineState from "./lineState";
import Match from "./match";
import ModifierPair from "./modifierPair";
import Scope from "./scope";
import Settings from "./settings";

export default class TextLine {
    public colorRanges = new Map<string, vscode.Range[]>();
    public readonly index: number;
    private lastModifierCheckPos = 0;
    private lineState: LineState;
    private scopeEndPosition = -1;
    private readonly settings: Settings;
    private readonly scopeChecker: Match;

    constructor(settings: Settings, index: number, document: vscode.TextDocument, lineState?: LineState) {
        this.settings = settings;
        this.scopeChecker = new Match(document.lineAt(index).text);
        this.index = index;
        if (lineState !== undefined) {
            this.lineState = lineState;
        }
        else {
            this.lineState = new LineState(settings);
        }
    }

    // Return a copy of the line while mantaining bracket state. colorRanges is not mantained.
    public cloneState() {
        // Update state for whole line before returning
        this.updateScopes(this.scopeChecker.content.length);
        return this.lineState.clone();
    }

    public getScope(position: vscode.Position): Scope | undefined {
        return this.lineState.getScope(position);
    }

    public addBracket(bracket: string, position: number) {
        if (this.settings.contextualParsing) {
            this.updateScopes(position, bracket);
            if (position <= this.scopeEndPosition) {
                return;
            }
        }

        const bracketOpenPosition = new vscode.Position(this.index, position);
        const bracketClosePosition = new vscode.Position(this.index, position + bracket.length);
        const range = new vscode.Range(
            bracketOpenPosition,
            bracketClosePosition,
        );

        for (const bracketPair of this.settings.bracketPairs) {
            if (bracketPair.openCharacter === bracket) {
                const color = this.lineState.getOpenBracketColor(bracketPair, range);

                const colorRanges = this.colorRanges.get(color);

                if (colorRanges !== undefined) {
                    colorRanges.push(range);
                }
                else {
                    this.colorRanges.set(color, [range]);
                }
                return;
            }
            else if (bracketPair.closeCharacter === bracket) {
                const color = this.lineState.getCloseBracketColor(bracketPair, range);

                const colorRanges = this.colorRanges.get(color);
                if (colorRanges !== undefined) {
                    colorRanges.push(range);
                }
                else {
                    this.colorRanges.set(color, [range]);
                }
                return;
            }
        }
    }

    private updateScopes(bracketPosition: number, bracket: string = ""): void {
        for (let i = this.lastModifierCheckPos; i <= bracketPosition; i++) {
            // If in a scope, check for closing characters
            if (this.lineState.activeScope) {
                // Unless in a scope that continues until end of line
                if (this.lineState.activeScope.isSingleLineComment()) {
                    return;
                }

                if (this.lineState.activeScope.closer) {
                    if (this.scopeChecker.contains(i, this.lineState.activeScope.closer)) {
                        i += this.lineState.activeScope.closer.match.length - 1;
                        this.scopeEndPosition = i;
                        this.lineState.activeScope = undefined;
                    }
                }
                else {
                    throw new Error("Closing character is undefined");
                }
            }
            else {
                i += this.checkForOpeningScope(i);
            }
        }
        this.lastModifierCheckPos = bracketPosition + bracket.length +1;
    }

    private checkForOpeningScope(position: number): number {
        for (const scope of this.settings.scopes) {
            if (this.scopeChecker.contains(position, scope.opener)) {
                this.lineState.activeScope = scope;
                if (scope.isSingleLineComment()) {
                    this.scopeEndPosition = Infinity;
                }
                else {
                    this.scopeEndPosition = -1;
                }
                return scope.opener.match.length - 1;
            }
        }

        return 0;
    }
}
