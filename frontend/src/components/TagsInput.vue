<script setup lang="ts">
import { ref } from 'vue';

const props = defineProps<{ modelValue: string[]; placeholder?: string; max?: number }>();
const emit = defineEmits<{ (e: 'update:modelValue', v: string[]): void }>();

const input = ref('');
const limit = props.max ?? 15;

function add() {
  const v = input.value.trim().replace(/,$/, '');
  if (v && !props.modelValue.includes(v) && props.modelValue.length < limit) {
    emit('update:modelValue', [...props.modelValue, v]);
  }
  input.value = '';
}
function remove(i: number) {
  const next = [...props.modelValue];
  next.splice(i, 1);
  emit('update:modelValue', next);
}
function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' || e.key === ',') {
    e.preventDefault();
    add();
  } else if (e.key === 'Backspace' && !input.value && props.modelValue.length) {
    remove(props.modelValue.length - 1);
  }
}
</script>

<template>
  <div class="tags-input">
    <span v-for="(t, i) in modelValue" :key="i" class="tag-chip">
      {{ t }}
      <i class="pi pi-times" @click="remove(i)" />
    </span>
    <input
      v-model="input"
      :placeholder="modelValue.length ? '' : placeholder"
      maxlength="30"
      @keydown="onKeydown"
      @blur="add"
    />
  </div>
</template>

<style scoped>
.tags-input {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35rem;
  width: 100%;
  min-height: 42px;
  padding: 0.35rem 0.5rem;
  border: 1px solid var(--p-inputtext-border-color, var(--border));
  border-radius: 6px;
  background: var(--p-inputtext-background, var(--surface));
}
.tags-input:focus-within {
  border-color: var(--brand);
}
.tag-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  background: color-mix(in srgb, var(--brand) 12%, transparent);
  color: var(--brand);
  border-radius: 6px;
  padding: 0.15rem 0.5rem;
  font-size: 0.8rem;
  font-weight: 500;
}
.tag-chip i {
  cursor: pointer;
  font-size: 0.65rem;
  opacity: 0.8;
}
.tag-chip i:hover {
  opacity: 1;
}
.tags-input input {
  flex: 1;
  min-width: 90px;
  border: none;
  outline: none;
  background: transparent;
  color: var(--text);
  font: inherit;
  padding: 0.2rem;
}
</style>
