/*
Copyright 2019 New Vector Ltd
Copyright 2019, 2020 The Matrix.org Foundation C.I.C.


Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

import React from 'react';
import {_t} from "../../../../../languageHandler";
import SettingsStore, {SettingLevel} from "../../../../../settings/SettingsStore";
import * as sdk from "../../../../../index";
import { enumerateThemes } from "../../../../../theme";
import ThemeWatcher from "../../../../../settings/watchers/ThemeWatcher";
import Field from "../../../elements/Field";
import Slider from "../../../elements/Slider";
import AccessibleButton from "../../../elements/AccessibleButton";
import dis from "../../../../../dispatcher/dispatcher";
import { FontWatcher } from "../../../../../settings/watchers/FontWatcher";
import { RecheckThemePayload } from '../../../../../dispatcher/payloads/RecheckThemePayload';
import { Action } from '../../../../../dispatcher/actions';
import { IValidationResult, IFieldState } from '../../../elements/Validation';

interface IProps {
}

interface IThemeState {
    theme: string,
    useSystemTheme: boolean,
}

export interface CustomThemeMessage {
    isError: boolean,
    text: string
};

interface IState extends IThemeState {
    // String displaying the current selected fontSize.
    // Needs to be string for things like '17.' without
    // trailing 0s.
    fontSize: string,
    customThemeUrl: string,
    customThemeMessage: CustomThemeMessage,
    useCustomFontSize: boolean,
}

export default class AppearanceUserSettingsTab extends React.Component<IProps, IState> {

    private themeTimer: NodeJS.Timeout;

    constructor(props: IProps) {
        super(props);

        this.state = {
            fontSize: (SettingsStore.getValue("baseFontSize", null) + FontWatcher.SIZE_DIFF).toString(),
            ...this.calculateThemeState(),
            customThemeUrl: "",
            customThemeMessage: {isError: false, text: ""},
            useCustomFontSize: SettingsStore.getValue("useCustomFontSize"),
        };
    }

    private calculateThemeState(): IThemeState {
        // We have to mirror the logic from ThemeWatcher.getEffectiveTheme so we
        // show the right values for things.

        const themeChoice: string = SettingsStore.getValueAt(SettingLevel.ACCOUNT, "theme");
        const systemThemeExplicit: boolean = SettingsStore.getValueAt(
            SettingLevel.DEVICE, "use_system_theme", null, false, true);
        const themeExplicit: string = SettingsStore.getValueAt(
            SettingLevel.DEVICE, "theme", null, false, true);

        // If the user has enabled system theme matching, use that.
        if (systemThemeExplicit) {
            return {
                theme: themeChoice,
                useSystemTheme: true,
            };
        }

        // If the user has set a theme explicitly, use that (no system theme matching)
        if (themeExplicit) {
            return {
                theme: themeChoice,
                useSystemTheme: false,
            };
        }

        // Otherwise assume the defaults for the settings
        return {
            theme: themeChoice,
            useSystemTheme: SettingsStore.getValueAt(SettingLevel.DEVICE, "use_system_theme"),
        };
    }

    private onThemeChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
        const newTheme = e.target.value;
        if (this.state.theme === newTheme) return;

        // doing getValue in the .catch will still return the value we failed to set,
        // so remember what the value was before we tried to set it so we can revert
        const oldTheme: string = SettingsStore.getValue('theme');
        SettingsStore.setValue("theme", null, SettingLevel.DEVICE, newTheme).catch(() => {
            dis.dispatch<RecheckThemePayload>({action: Action.RecheckTheme});
            this.setState({theme: oldTheme});
        });
        this.setState({theme: newTheme});
        // The settings watcher doesn't fire until the echo comes back from the
        // server, so to make the theme change immediately we need to manually
        // do the dispatch now
        // XXX: The local echoed value appears to be unreliable, in particular
        // when settings custom themes(!) so adding forceTheme to override
        // the value from settings.
        dis.dispatch<RecheckThemePayload>({action: Action.RecheckTheme, forceTheme: newTheme});
    };

    private onUseSystemThemeChanged = (checked: boolean): void => {
        this.setState({useSystemTheme: checked});
        SettingsStore.setValue("use_system_theme", null, SettingLevel.DEVICE, checked);
        dis.dispatch<RecheckThemePayload>({action: Action.RecheckTheme});
    };

    private onFontSizeChanged = (size: number): void => {
        this.setState({fontSize: size.toString()});
        SettingsStore.setValue("baseFontSize", null, SettingLevel.DEVICE, size - FontWatcher.SIZE_DIFF);
    };

    private onValidateFontSize = async ({value}: Pick<IFieldState, "value">): Promise<IValidationResult> => {
        const parsedSize = parseFloat(value);
        const min = FontWatcher.MIN_SIZE + FontWatcher.SIZE_DIFF;
        const max = FontWatcher.MAX_SIZE + FontWatcher.SIZE_DIFF;

        if (isNaN(parsedSize)) {
            return {valid: false, feedback: _t("Size must be a number")};
        }

        if (!(min <= parsedSize && parsedSize <= max)) {
            return {
                valid: false,
                feedback: _t('Custom font size can only be between %(min)s pt and %(max)s pt', {min, max}),
            };
        }

        SettingsStore.setValue(
            "baseFontSize",
            null,
            SettingLevel.DEVICE,
            parseInt(value, 10) - FontWatcher.SIZE_DIFF
        );

        return {valid: true, feedback: _t('Use between %(min)s pt and %(max)s pt', {min, max})};
    }

    private onAddCustomTheme = async (): Promise<void> => {
        let currentThemes: string[] = SettingsStore.getValue("custom_themes");
        if (!currentThemes) currentThemes = [];
        currentThemes = currentThemes.map(c => c); // cheap clone

        if (this.themeTimer) {
            clearTimeout(this.themeTimer);
        }

        try {
            const r = await fetch(this.state.customThemeUrl);
            // XXX: need some schema for this
            const themeInfo = await r.json();
            if (!themeInfo || typeof(themeInfo['name']) !== 'string' || typeof(themeInfo['colors']) !== 'object') {
                this.setState({customThemeMessage: {text: _t("Invalid theme schema."), isError: true}});
                return;
            }
            currentThemes.push(themeInfo);
        } catch (e) {
            console.error(e);
            this.setState({customThemeMessage: {text: _t("Error downloading theme information."), isError: true}});
            return; // Don't continue on error
        }

        await SettingsStore.setValue("custom_themes", null, SettingLevel.ACCOUNT, currentThemes);
        this.setState({customThemeUrl: "", customThemeMessage: {text: _t("Theme added!"), isError: false}});

        this.themeTimer = setTimeout(() => {
            this.setState({customThemeMessage: {text: "", isError: false}});
        }, 3000);
    };

    private onCustomThemeChange = (e: React.ChangeEvent<HTMLSelectElement | HTMLInputElement>): void => {
        this.setState({customThemeUrl: e.target.value});
    };

    private renderThemeSection() {
        const SettingsFlag = sdk.getComponent("views.elements.SettingsFlag");
        const StyledCheckbox = sdk.getComponent("views.elements.StyledCheckbox");
        const StyledRadioButton = sdk.getComponent("views.elements.StyledRadioButton");

        const themeWatcher = new ThemeWatcher();
        let systemThemeSection: JSX.Element;
        if (themeWatcher.isSystemThemeSupported()) {
            systemThemeSection = <div>
                <StyledCheckbox
                    checked={this.state.useSystemTheme}
                    onChange={(e) => this.onUseSystemThemeChanged(e.target.checked)}
                >
                    {SettingsStore.getDisplayName("use_system_theme")}
                </StyledCheckbox>
            </div>;
        }

        let customThemeForm: JSX.Element;
        if (SettingsStore.isFeatureEnabled("feature_custom_themes")) {
            let messageElement = null;
            if (this.state.customThemeMessage.text) {
                if (this.state.customThemeMessage.isError) {
                    messageElement = <div className='text-error'>{this.state.customThemeMessage.text}</div>;
                } else {
                    messageElement = <div className='text-success'>{this.state.customThemeMessage.text}</div>;
                }
            }
            customThemeForm = (
                <div className='mx_SettingsTab_section'>
                    <form onSubmit={this.onAddCustomTheme}>
                        <Field
                            label={_t("Custom theme URL")}
                            type='text'
                            id='mx_GeneralUserSettingsTab_customThemeInput'
                            autoComplete="off"
                            onChange={this.onCustomThemeChange}
                            value={this.state.customThemeUrl}
                        />
                        <AccessibleButton
                            onClick={this.onAddCustomTheme}
                            type="submit" kind="primary_sm"
                            disabled={!this.state.customThemeUrl.trim()}
                        >{_t("Add theme")}</AccessibleButton>
                        {messageElement}
                    </form>
                </div>
            );
        }

        // XXX: replace any type here
        const themes = Object.entries<any>(enumerateThemes())
            .map(p => ({id: p[0], name: p[1]})); // convert pairs to objects for code readability
        const builtInThemes = themes.filter(p => !p.id.startsWith("custom-"));
        const customThemes = themes.filter(p => !builtInThemes.includes(p))
            .sort((a, b) => a.name.localeCompare(b.name));
        const orderedThemes = [...builtInThemes, ...customThemes];
        return (
            <div className="mx_SettingsTab_section mx_AppearanceUserSettingsTab_themeSection">
                <span className="mx_SettingsTab_subheading">{_t("Theme")}</span>
                {systemThemeSection}
                <div className="mx_ThemeSelectors" onChange={this.onThemeChange}>
                    {orderedThemes.map(theme => {
                        return <StyledRadioButton
                            key={theme.id}
                            value={theme.id}
                            name={"theme"}
                            disabled={this.state.useSystemTheme}
                            checked={!this.state.useSystemTheme && theme.id === this.state.theme}
                            className={"mx_ThemeSelector_" + theme.id}
                        >
                            {theme.name}
                        </StyledRadioButton>;
                    })}
                </div>
                {customThemeForm}
                <SettingsFlag name="useCompactLayout" level={SettingLevel.ACCOUNT} useCheckbox={true} />
           </div>
        );
    }

    private renderFontSection() {
        const SettingsFlag = sdk.getComponent("views.elements.SettingsFlag");
        return <div className="mx_SettingsTab_section mx_AppearanceUserSettingsTab_fontScaling">
            <span className="mx_SettingsTab_subheading">{_t("Font size")}</span>
            <div className="mx_AppearanceUserSettingsTab_fontSlider">
                <div className="mx_AppearanceUserSettingsTab_fontSlider_smallText">Aa</div>
                <Slider
                    values={[13, 15, 16, 18, 20]}
                    value={parseInt(this.state.fontSize, 10)}
                    onSelectionChange={this.onFontSizeChanged}
                    displayFunc={_ => ""}
                    disabled={this.state.useCustomFontSize}
                />
                <div className="mx_AppearanceUserSettingsTab_fontSlider_largeText">Aa</div>
            </div>
            <SettingsFlag
                name="useCustomFontSize"
                level={SettingLevel.ACCOUNT}
                onChange={(checked) => this.setState({useCustomFontSize: checked})}
                useCheckbox={true}
            />
            <Field
                type="number"
                label={_t("Font size")}
                autoComplete="off"
                placeholder={this.state.fontSize.toString()}
                value={this.state.fontSize.toString()}
                id="font_size_field"
                onValidate={this.onValidateFontSize}
                onChange={(value) => this.setState({fontSize: value.target.value})}
                disabled={!this.state.useCustomFontSize}
                className="mx_SettingsTab_customFontSizeField"
            />
        </div>;
    }

    render() {
        return (
            <div className="mx_SettingsTab mx_AppearanceUserSettingsTab">
                <div className="mx_SettingsTab_heading">{_t("Customise your appearance")}</div>
                <div className="mx_SettingsTab_SubHeading">
                    {_t("Appearance Settings only affect this Riot session.")}
                </div>
                {this.renderThemeSection()}
                {SettingsStore.isFeatureEnabled("feature_font_scaling") ? this.renderFontSection() : null}
            </div>
        );
    }
}
