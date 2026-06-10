<template>
    <v-app-bar app :dark="$vuetify.theme.dark === false" :color="appBarColor" :clipped-left="navigationState.isClipped">
        <v-app-bar-nav-icon @click.stop="toggle"></v-app-bar-nav-icon>
        <v-toolbar-title class="title-content" v-bind:class="{ clickable: !!needsTitleClickEvent === true }" v-on:click="onTitle">
            {{ title }}
        </v-toolbar-title>
        <v-spacer></v-spacer>
        <div v-if="isShowClock" class="header-clock pr-3">{{ currentTimeStr }}</div>
        <slot name="menu"></slot>
        <template v-if="this.$slots.extension" v-slot:extension>
            <slot name="extension"></slot>
        </template>
    </v-app-bar>
</template>

<script lang="ts">
import container from '@/model/ModelContainer';
import { Component, Prop, Vue, Watch } from 'vue-property-decorator';
import INavigationState from '../../model/state/navigation/INavigationState';
import { ISettingStorageModel } from '../../model/storage/setting/ISettingStorageModel';
import DateUtil from '../../util/DateUtil';

@Component({})
export default class TitleBar extends Vue {
    @Prop({ required: true })
    public title!: string;

    @Prop({ required: false })
    public needsTitleClickEvent: boolean | undefined;

    public navigationState: INavigationState = container.get<INavigationState>('INavigationState');
    public settingModel: ISettingStorageModel = container.get<ISettingStorageModel>('ISettingStorageModel');

    public currentTimeStr: string = '';
    private clockInterval: number | null = null;

    get isShowClock(): boolean {
        return this.settingModel.getSavedValue().isShowClock;
    }

    public mounted(): void {
        this.updateClock();
        this.clockInterval = window.setInterval(() => {
            this.updateClock();
        }, 1000);
    }

    public beforeDestroy(): void {
        if (this.clockInterval !== null) {
            window.clearInterval(this.clockInterval);
        }
    }

    private updateClock(): void {
        if (!this.isShowClock) return;

        const now = new Date();
        const jst = DateUtil.getJaDate(now);

        const year = jst.getFullYear();
        const month = ('0' + (jst.getMonth() + 1)).slice(-2);
        const day = ('0' + jst.getDate()).slice(-2);
        const week = ['日', '月', '火', '水', '木', '金', '土'][jst.getDay()];

        let hours = jst.getHours();
        const ampm = hours >= 12 ? 'PM' : 'AM';
        hours = hours % 12;
        hours = hours ? hours : 12; // the hour '0' should be '12'
        const hoursStr = ('0' + hours).slice(-2);
        const minutes = ('0' + jst.getMinutes()).slice(-2);

        this.currentTimeStr = `${year}-${month}-${day} (${week}) ${hoursStr}:${minutes} ${ampm}`;
    }

    /**
     * title bar の色を返す
     */
    get appBarColor(): string | null {
        return this.$vuetify.theme.dark === true ? null : 'indigo';
    }

    public onTitle(): void {
        this.$emit('click');
    }

    public toggle(): void {
        this.navigationState.toggle();
    }

    @Watch('title', { immediate: true })
    private onTitleChanged(newTitle: string, old: string): void {
        document.title = newTitle;
    }
}
</script>

<style lang="sass">
.title-content
    cursor: default
    user-select: none

    &.clickable
        cursor: pointer
</style>
<style lang="sass" scoped>
.header-clock
    font-size: 1rem
    user-select: none
    opacity: 0.8
</style>
