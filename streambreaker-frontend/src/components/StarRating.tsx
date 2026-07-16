import { Star } from 'lucide-react';
import { useState } from 'react';

interface StarRatingProps {
  rating?: number;
  onRate?: (rating: number) => void;
  size?: 'sm' | 'md' | 'lg';
  interactive?: boolean;
  showValue?: boolean;
}

export default function StarRating({ 
  rating: initialRating = 0, 
  onRate, 
  size = 'md',
  interactive = false,
  showValue = true
}: StarRatingProps) {
  const [rating, setRating] = useState(initialRating);
  const [hoverRating, setHoverRating] = useState(0);

  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-6 h-6',
    lg: 'w-8 h-8'
  };

  const handleClick = (value: number) => {
    if (!interactive || !onRate) return;
    setRating(value);
    onRate(value);
  };

  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((value) => (
        <button
          key={value}
          onClick={() => handleClick(value)}
          onMouseEnter={() => interactive && setHoverRating(value)}
          onMouseLeave={() => interactive && setHoverRating(0)}
          disabled={!interactive}
          className={`${interactive ? 'cursor-pointer hover:scale-110' : 'cursor-default'} transition-transform duration-150`}
          aria-label={`Rate ${value} star${value > 1 ? 's' : ''}`}
        >
          <Star
            className={`${sizeClasses[size]} ${
              value <= (hoverRating || rating)
                ? 'text-amber-400 fill-amber-400'
                : 'text-gray-600'
            } transition-colors duration-150`}
          />
        </button>
      ))}
      {showValue && (
        <span className={`ml-2 font-semibold ${
          size === 'sm' ? 'text-xs' : size === 'lg' ? 'text-lg' : 'text-sm'
        } text-gray-300`}>
          {(hoverRating || rating).toFixed(1)}
        </span>
      )}
    </div>
  );
}
