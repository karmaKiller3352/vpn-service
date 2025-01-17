# Указываем базовый образ
FROM node:18-alpine

# Устанавливаем рабочую директорию
WORKDIR /app

# Копируем package.json и package-lock.json
COPY package*.json ./

# Устанавливаем зависимости
RUN npm install

# Копируем весь исходный код
COPY . .

# Сборка приложения
RUN npm run build

# Указываем порт, который будет слушать приложение
EXPOSE 3000

# Запускаем приложение
CMD ["npm", "run", "start:prod"]
