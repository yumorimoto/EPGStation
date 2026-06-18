<template>
    <v-app-bar app :color="appBarColor" :clipped-left="navigationState.isClipped">
        <v-btn icon v-on:click="onClose">
            <v-icon>mdi-close</v-icon>
        </v-btn>
        <v-toolbar-title>{{ title }}</v-toolbar-title>
        <v-spacer></v-spacer>
        <div v-if="isShowClock" class="header-clock pr-3">{{ currentTimeStr }}</div>
        <v-btn icon v-on:click="onSelectAll">
            <v-icon>mdi-select-all</v-icon>
        </v-btn>
        <v-btn icon v-on:click="onDelete">
            <v-icon>mdi-delete</v-icon>
        </v-btn>
    </v-app-bar>
</template>

<script lang="ts">
import container from '@/model/ModelContainer';
import { Component, Prop, Vue, Watch } from 'vue-property-decorator';
import INavigationState from '../../model/state/navigation/INavigationState';
import { ISettingStorageModel } from '../../model/storage/setting/ISettingStorageModel';
import DateUtil from '../../util/DateUtil';

@Component({})
export default class EditTitleBar extends Vue {
    @Prop({ required: true })
    public title!: string;

    @Prop({ required: true })
    public isEditMode!: boolean;

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
     * Prop で受け取った isEditMode は直接書き換えられないので
     * getter, setter を用意する
     */
    get editMode(): boolean {
        return this.isEditMode;
    }
    set editMode(value: boolean) {
        this.$emit('update:isEditMode', value);
    }

    /**
     * title bar の色を返す
     */
    get appBarColor(): string | null {
        return this.$vuetify.theme.dark === true ? null : 'white';
    }

    /**
     * 編集モード終了
     */
    public onClose(): void {
        this.$emit('exit');
        this.editMode = false;
    }

    /**
     * 全て選択
     */
    public onSelectAll(): void {
        this.$emit('selectall');
    }

    /**
     * 削除
     */
    public onDelete(): void {
        this.$emit('delete');
    }
}
</script>

<style lang="sass" scoped>
.header-clock
    font-size: 1rem
    user-select: none
    opacity: 0.8
</style>
