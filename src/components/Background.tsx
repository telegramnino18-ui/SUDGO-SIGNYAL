import React from 'react';
import { motion } from 'motion/react';

export const Background = () => {
  return (
    <div className="fixed inset-0 z-[-1] overflow-hidden bg-[#050505]">
      {/* Animated gradient orbs */}
      <motion.div
        animate={{
          x: [0, 100, -50, 0],
          y: [0, -100, 50, 0],
          scale: [1, 1.2, 0.8, 1],
        }}
        transition={{
          duration: 15,
          repeat: Infinity,
          ease: "easeInOut"
        }}
        className="absolute top-[10%] left-[20%] w-[40rem] h-[40rem] bg-violet-600/20 rounded-full blur-[120px]"
      />
      
      <motion.div
        animate={{
          x: [0, -150, 100, 0],
          y: [0, 150, -100, 0],
          scale: [1, 1.5, 1, 1],
        }}
        transition={{
          duration: 20,
          repeat: Infinity,
          ease: "easeInOut",
          delay: 2
        }}
        className="absolute top-[30%] right-[10%] w-[35rem] h-[35rem] bg-indigo-600/20 rounded-full blur-[120px]"
      />

      <motion.div
        animate={{
          x: [0, 200, -150, 0],
          y: [0, -100, 200, 0],
          scale: [1, 0.8, 1.2, 1],
        }}
        transition={{
          duration: 18,
          repeat: Infinity,
          ease: "easeInOut",
          delay: 4
        }}
        className="absolute bottom-[-10%] left-[30%] w-[45rem] h-[45rem] bg-blue-600/10 rounded-full blur-[150px]"
      />
      
      {/* Subtle grid pattern overlay */}
      <div 
        className="absolute inset-0 opacity-20"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='40' height='40' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0 0h40v40H0z' fill='none'/%3E%3Cpath d='M0 39.5h40M39.5 0v40' stroke='%23ffffff' stroke-width='1' stroke-opacity='0.2'/%3E%3C/svg%3E")`,
          maskImage: 'radial-gradient(circle at center, white, transparent 80%)',
          WebkitMaskImage: 'radial-gradient(circle at center, white, transparent 80%)'
        }}
      />
    </div>
  );
};
