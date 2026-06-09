<script setup lang="ts">
import { onUnmounted, ref, watch } from 'vue';
import Button from 'primevue/button';
import { ticketService } from '@/services/ticket.service';
import { useAuthStore } from '@/stores/auth';
import type { Attachment } from '@/types';

const props = defineProps<{ attachments: Attachment[] }>();
const emit = defineEmits<{ (e: 'deleted', id: string): void }>();

const auth = useAuthStore();
const thumbs = ref<Record<string, string>>({});

const isImage = (a: Attachment) => a.mimeType.startsWith('image/');
function fmtSize(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1048576).toFixed(1)} MB`;
}
function canDelete(a: Attachment) {
  return auth.isAdmin || a.uploaderId === auth.user?.id;
}

async function loadThumb(a: Attachment) {
  if (thumbs.value[a.id]) return;
  try {
    const blob = await ticketService.downloadAttachment(a.id);
    thumbs.value[a.id] = URL.createObjectURL(blob);
  } catch {
    /* ignore */
  }
}

async function download(a: Attachment) {
  try {
    const blob = await ticketService.downloadAttachment(a.id);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = a.filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  } catch {
    /* ignore */
  }
}

async function remove(a: Attachment) {
  try {
    await ticketService.deleteAttachment(a.id);
    emit('deleted', a.id);
  } catch {
    /* ignore */
  }
}

watch(
  () => props.attachments,
  (list) => list.filter(isImage).forEach(loadThumb),
  { immediate: true, deep: true },
);

onUnmounted(() => Object.values(thumbs.value).forEach((u) => URL.revokeObjectURL(u)));
</script>

<template>
  <div class="att-grid">
    <div v-for="a in attachments" :key="a.id" class="att-item">
      <div class="att-thumb" @click="download(a)" :title="a.filename">
        <img v-if="isImage(a) && thumbs[a.id]" :src="thumbs[a.id]" :alt="a.filename" />
        <i v-else :class="isImage(a) ? 'pi pi-image' : 'pi pi-file'" />
      </div>
      <div class="att-info">
        <span class="att-name" :title="a.filename" @click="download(a)">{{ a.filename }}</span>
        <span class="att-size">{{ fmtSize(a.size) }}</span>
      </div>
      <Button
        v-if="canDelete(a)"
        icon="pi pi-times"
        text
        rounded
        size="small"
        severity="secondary"
        @click="remove(a)"
      />
    </div>
  </div>
</template>

<style scoped>
.att-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
}
.att-item {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 0.45rem 0.6rem 0.45rem 0.45rem;
  background: var(--surface-2);
  max-width: 240px;
}
.att-thumb {
  width: 42px;
  height: 42px;
  border-radius: 8px;
  overflow: hidden;
  display: grid;
  place-items: center;
  background: var(--surface-hover);
  cursor: pointer;
  flex-shrink: 0;
}
.att-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.att-thumb i {
  font-size: 1.2rem;
  color: var(--brand);
}
.att-info {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.att-name {
  font-size: 0.82rem;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
  color: var(--text);
}
.att-name:hover {
  color: var(--brand);
}
.att-size {
  font-size: 0.72rem;
  color: var(--text-muted);
}
</style>
