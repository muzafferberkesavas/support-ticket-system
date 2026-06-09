<script setup lang="ts">
withDefaults(defineProps<{ size?: number; animated?: boolean }>(), {
  size: 40,
  animated: true,
});
</script>

<template>
  <span class="brand-mark" :class="{ animated }" :style="{ width: size + 'px', height: size + 'px' }">
    <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" :width="size" :height="size">
      <defs>
        <linearGradient id="bm-grad" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
          <stop stop-color="#6366F1" />
          <stop offset="0.5" stop-color="#7C3AED" />
          <stop offset="1" stop-color="#4338CA" />
        </linearGradient>
      </defs>
      <!-- rounded tile -->
      <rect x="2" y="2" width="44" height="44" rx="13" fill="url(#bm-grad)" />
      <!-- support chat bubble -->
      <path
        d="M14 18.5C14 16.567 15.567 15 17.5 15H30.5C32.433 15 34 16.567 34 18.5V25.5C34 27.433 32.433 29 30.5 29H22L17 33V29H17.5C15.567 29 14 27.433 14 25.5V18.5Z"
        fill="white"
        fill-opacity="0.95"
      />
      <!-- three dots -->
      <circle class="dot dot-1" cx="20" cy="22" r="1.7" fill="#6366F1" />
      <circle class="dot dot-2" cx="24" cy="22" r="1.7" fill="#7C3AED" />
      <circle class="dot dot-3" cx="28" cy="22" r="1.7" fill="#4338CA" />
    </svg>
  </span>
</template>

<style scoped>
.brand-mark {
  display: inline-grid;
  place-items: center;
  flex-shrink: 0;
  filter: drop-shadow(0 4px 10px rgba(79, 70, 229, 0.35));
}
.brand-mark svg {
  display: block;
}
.animated .dot {
  animation: dot-bounce 1.4s infinite ease-in-out;
}
.animated .dot-2 {
  animation-delay: 0.18s;
}
.animated .dot-3 {
  animation-delay: 0.36s;
}
@keyframes dot-bounce {
  0%,
  60%,
  100% {
    transform: translateY(0);
    opacity: 0.85;
  }
  30% {
    transform: translateY(-2.5px);
    opacity: 1;
  }
}
@media (prefers-reduced-motion: reduce) {
  .animated .dot {
    animation: none;
  }
}
</style>
