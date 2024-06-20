FROM  node

COPY . /home/app
RUN cd /home/app && npm i

EXPOSE 8100
WORKDIR /home/app
CMD [ "bash", "-c", "npm run start" ]
